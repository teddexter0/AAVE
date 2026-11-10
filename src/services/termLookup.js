import { dbHelpers } from './firebase'
import { bundledTerm, hasConversationalTag, lookupDictionary, normalizeTerm, termSlug, withTimeout } from './lookupCore'
import { seedTerms } from '../data/seedTerms'
import { referenceDocuments } from '../data/referenceDocuments'

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

/** Look up curated expressions or dictionary senses explicitly tagged as slang. */
export async function lookupTerm(rawTerm, uid = null) {
  const clean = sanitiseInput(rawTerm)
  const term = normalizeTerm(clean)
  if (!term) return null
  const slug = termSlug(term)
  // Exact typed terms always win. Fuzzy matches remain optional UI suggestions.
  let termData = bundledTerm(term, seedTerms)
  const local = referenceDocuments.find(e => e.word && normalizeTerm(e.word) === term)
  if (!termData && local) termData = { ...buildResult(local), source: 'curated' }
  if (!termData) {
    try {
      const cached = await withTimeout(dbHelpers.getTermBySlug(slug), 1800)
      if (cached?.source === 'dictionary' && hasConversationalTag((cached.category || '').split(','), term)) {
        termData = cached
      }
    } catch {
      // The live lookup is still available if Firestore is unreachable.
    }
  }
  if (!termData) termData = await lookupDictionary(term)
  if (!termData) return null
  const canonicalId = termSlug(termData.term)
  const savePromise = uid
    ? dbHelpers.addToWordBank(uid, canonicalId, termData.term, termData).then(() => true).catch(() => false)
    : null
  return {
    termData, source: termData.source || 'db',
    termId: canonicalId,
    correctedFrom: normalizeTerm(termData.term) === term ? null : clean,
    savePromise,
  }
}
