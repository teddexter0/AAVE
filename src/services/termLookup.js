import { dbHelpers } from './firebase'
import { bundledTerm, lookupDictionary, normalizeTerm, withTimeout } from './lookupCore'
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

/** Exact local entry, bounded database lookup, then live dictionary lookup. */
export async function lookupTerm(rawTerm, uid = null) {
  const clean = sanitiseInput(rawTerm)
  const term = normalizeTerm(clean)
  if (!term) return null
  const slug = encodeURIComponent(term.replace(/\s+/g, '_'))
  // Exact typed terms always win. Fuzzy matches remain optional UI suggestions.
  let termData = bundledTerm(term, seedTerms)
  const local = referenceDocuments.find(e => e.word && normalizeTerm(e.word) === term)
  if (!termData && local) termData = { ...buildResult(local), source: 'curated' }
  let stored = false
  if (!termData) {
    try { termData = await withTimeout(dbHelpers.getTermBySlug(slug), 1800); stored = Boolean(termData) } catch {}
  }
  if (!termData) termData = await lookupDictionary(term)
  if (!termData) return null
  const savePromise = uid ? (async () => {
    const id = stored ? slug : await dbHelpers.saveTerm(termData)
    await dbHelpers.addToWordBank(uid, id, termData.term)
    return true
  })().catch(() => false) : null
  return { termData, source: termData.source || 'db', termId: slug, correctedFrom: null, savePromise }
}
