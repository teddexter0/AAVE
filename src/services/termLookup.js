import { dbHelpers } from './firebase'
import { lookupWithGemini } from './gemini'
import { referenceDocuments } from '../data/referenceDocuments'

// ── Fuzzy helpers ─────────────────────────────────────────────────────────────

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
 * Collapse runs of 3+ identical chars to 2: "slayyy" → "slayy", "driiip" → "driip".
 * This lets elongated slang match the dictionary form.
 */
const deElongate = (s) => s.replace(/(.)\1{2,}/g, '$1$1')

/**
 * Local fuzzy lookup against referenceDocuments.
 * Applies de-elongation on both needle and candidate so "slayyy" → "slay" etc.
 * Threshold: 0.45 (more forgiving of typos than the old 0.35).
 */
function lookupInLocalData(rawTerm) {
  const raw    = rawTerm.trim().toLowerCase()
  const needle = deElongate(raw)

  // Exact match on original form first
  for (const e of referenceDocuments) {
    if (e.word && e.word.toLowerCase() === raw) {
      return buildResult(e)
    }
  }

  let bestEntry = null
  let bestScore = Infinity

  for (const e of referenceDocuments) {
    if (!e.word) continue
    const candidate = deElongate(e.word.toLowerCase())

    // Exact match after de-elongation
    if (candidate === needle) { return buildResult(e) }

    // Prefix match → cheap boost
    if (candidate.startsWith(needle) || needle.startsWith(candidate)) {
      const score = 0.1
      if (score < bestScore) { bestScore = score; bestEntry = e }
      continue
    }

    const maxLen = Math.max(needle.length, candidate.length)
    const dist   = editDistance(needle, candidate) / maxLen
    if (dist < bestScore) { bestScore = dist; bestEntry = e }
  }

  if (!bestEntry || bestScore > 0.45) return null
  return buildResult(bestEntry)
}

function buildResult(e) {
  return {
    term:       e.word,
    definition: e.meaning,
    example:    e.context  || '',
    origin:     e.origin   || '',
    related:    [],
    category:   'expression',
  }
}

// ── Input sanitisation ────────────────────────────────────────────────────────

/**
 * Strip angle-bracket HTML, control characters, and enforce a 60-char cap.
 * React already escapes output, but we sanitise input before it touches
 * Firestore or is embedded in Gemini prompts (prompt-injection defence).
 */
export function sanitiseInput(raw) {
  return raw
    .replace(/<[^>]*>/g, '')          // no HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '') // no control chars
    .trim()
    .slice(0, 60)
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Lookup order: Firestore (exact slug) → local referenceDocuments (fuzzy) → Gemini
 * Returns { termData, source, termId, correctedFrom? } or null.
 * `correctedFrom` is set when the matched term differs from what the user typed,
 * so the UI can show "Showing results for 'slay'" etc.
 */
export async function lookupTerm(rawTerm, uid = null) {
  const clean  = sanitiseInput(rawTerm)
  const slug   = clean.toLowerCase().replace(/\s+/g, '_')
  let termId   = slug

  // 1. Exact Firestore lookup by slug
  let termData = null
  try {
    termData = await dbHelpers.getTermBySlug(slug)
  } catch (err) {
    console.warn('Firestore unavailable, falling back to local data:', err.message)
  }

  if (termData) {
    if (uid) { try { await dbHelpers.addToWordBank(uid, termId, termData.term) } catch {} }
    const correctedFrom = termData.term.toLowerCase() !== clean.toLowerCase() ? clean : null
    return { termData, source: 'db', termId, correctedFrom }
  }

  // 2. Local referenceDocuments — fuzzy + de-elongation
  termData = lookupInLocalData(clean)

  if (termData) {
    try {
      termId = await dbHelpers.saveTerm(termData)
      if (uid) { await dbHelpers.addToWordBank(uid, termId, termData.term) }
    } catch (err) {
      console.warn('Could not save local term to Firestore:', err.message)
    }
    const correctedFrom = termData.term.toLowerCase() !== clean.toLowerCase() ? clean : null
    return { termData, source: 'db', termId, correctedFrom }
  }

  // 3. Gemini AI fallback
  termData = await lookupWithGemini(clean)
  if (!termData) return null

  try {
    termId = await dbHelpers.saveTerm(termData)
    if (uid) { await dbHelpers.addToWordBank(uid, termId, termData.term) }
  } catch (err) {
    console.warn('Could not save to Firestore (offline?):', err.message)
  }

  return { termData, source: 'ai', termId, correctedFrom: null }
}
