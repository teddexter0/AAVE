import { dbHelpers } from './firebase'
import { lookupWithGemini } from './gemini'
import { referenceDocuments } from '../data/referenceDocuments'

/** Levenshtein edit distance between two strings */
function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Looks up a term in local referenceDocuments.
 * Accepts exact matches and fuzzy matches where normalised edit distance ≤ 0.35
 * (i.e. at least ~65% similar), so typos and minor variants still resolve.
 */
function lookupInLocalData(rawTerm) {
  const needle = rawTerm.trim().toLowerCase()

  let bestEntry = null
  let bestScore = Infinity

  for (const e of referenceDocuments) {
    if (!e.word) continue
    const candidate = e.word.toLowerCase()

    // Exact match — return immediately
    if (candidate === needle) {
      bestEntry = e
      break
    }

    // Fuzzy: normalised edit distance (0 = identical, 1 = completely different)
    const maxLen = Math.max(needle.length, candidate.length)
    const dist = editDistance(needle, candidate)
    const normDist = dist / maxLen

    if (normDist < bestScore) {
      bestScore = normDist
      bestEntry = e
    }
  }

  // Reject if best match is more than 35% different
  if (!bestEntry || bestScore > 0.35) return null

  return {
    term: bestEntry.word,
    definition: bestEntry.meaning,
    example: bestEntry.context || '',
    origin: bestEntry.origin || '',
    related: [],
    category: 'expression',
  }
}

/**
 * Lookup order: Firestore → local referenceDocuments → Gemini AI
 * AI results are auto-saved back to Firestore.
 *
 * @param {string} rawTerm  — the term as the user typed it
 * @param {string|null} uid — authenticated user id (or null)
 * @returns {{ termData, source, termId } | null}
 */
export async function lookupTerm(rawTerm, uid = null) {
  const slug = rawTerm.trim().toLowerCase().replace(/\s+/g, '_')
  let termId = slug

  // 1. Check Firestore (skip silently if Firebase is offline/unconfigured)
  let termData = null
  try {
    termData = await dbHelpers.getTermBySlug(slug)
  } catch (err) {
    console.warn('Firestore unavailable, falling back to local data:', err.message)
  }

  if (termData) {
    if (uid) {
      try { await dbHelpers.addToWordBank(uid, termId, termData.term) } catch {}
    }
    return { termData, source: 'db', termId }
  }

  // 2. Check local referenceDocuments (no network, no rate limits)
  termData = lookupInLocalData(rawTerm)

  if (termData) {
    // Save to Firestore so it's available next time
    try {
      termId = await dbHelpers.saveTerm(termData)
      if (uid) {
        await dbHelpers.addToWordBank(uid, termId, termData.term)
      }
    } catch (err) {
      console.warn('Could not save local term to Firestore:', err.message)
    }
    return { termData, source: 'db', termId }
  }

  // 3. Fall back to Gemini AI
  termData = await lookupWithGemini(rawTerm.trim())

  if (!termData) {
    return null // Not an AAVE term
  }

  // 3. Auto-save AI result to Firestore (skip if offline)
  try {
    termId = await dbHelpers.saveTerm(termData)
    if (uid) {
      await dbHelpers.addToWordBank(uid, termId, termData.term)
    }
  } catch (err) {
    console.warn('Could not save to Firestore (offline?):', err.message)
  }

  return { termData, source: 'ai', termId }
}
