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

  // 1. Check Firestore
  let termData = await dbHelpers.getTermBySlug(slug)
  let termId = slug

  if (termData) {
    // Found in db — add to word bank if user is signed in
    if (uid) {
      await dbHelpers.addToWordBank(uid, termId, termData.term)
    }
    return { termData, source: 'db', termId }
  }

  // 2. Fall back to Gemini AI
  termData = await lookupWithGemini(rawTerm.trim())

  if (!termData) {
    return null // Not an AAVE term
  }

  // 3. Auto-save AI result to Firestore
  termId = await dbHelpers.saveTerm(termData)

  // 4. Add to word bank
  if (uid) {
    await dbHelpers.addToWordBank(uid, termId, termData.term)
  }

  return { termData, source: 'ai', termId }
}
