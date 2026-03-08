import { dbHelpers } from './firebase'
import { lookupWithGemini } from './gemini'

/**
 * db-first lookup: checks Firestore first, falls back to Gemini AI.
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
    console.warn('Firestore unavailable, falling back to AI:', err.message)
  }

  if (termData) {
    if (uid) {
      try { await dbHelpers.addToWordBank(uid, termId, termData.term) } catch {}
    }
    return { termData, source: 'db', termId }
  }

  // 2. Fall back to Gemini AI
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
