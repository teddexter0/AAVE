import { phraseTerms } from '../data/phraseTerms.js'

export const normalizeTerm = term => String(term).normalize('NFKC').replace(/[‘’]/g, "'").trim()
  .replace(/^["“”]+|["“”!?.,]+$/g, '').trim().replace(/\s+/g, ' ').toLowerCase()

export const normalizeSearchKey = term => normalizeTerm(term).replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ')
export const termSlug = term => encodeURIComponent(normalizeTerm(term).replace(/\s+/g, '_'))

export function withTimeout(promise, ms, message = 'Lookup timed out. Please try again.') {
  let timer
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })]).finally(() => clearTimeout(timer))
}

export function bundledTerm(term, entries = []) {
  if (normalizeTerm(term) === 'ijbol') return {
    term: 'ijbol', definition: 'Short for “I just burst out laughing”: a reaction to something that made you laugh suddenly.',
    example: 'That unexpected ending — ijbol.', category: 'internet slang',
    origin: 'Used in online conversations and fandoms. This is internet shorthand; it should not automatically be classified as AAVE.',
    related: ['lol', 'lmao'], source: 'curated',
    sourceUrl: 'https://www.dictionary.com/culture/acronyms/ijbol', sourceLabel: 'Dictionary.com',
  }
  const candidates = [...phraseTerms, ...entries]
  const exact = candidates.find(entry =>
    [entry.term, ...(entry.aliases || [])].some(alias => normalizeTerm(alias) === normalizeTerm(term))
  )
  return exact || candidates.find(entry =>
    [entry.term, ...(entry.aliases || [])].some(alias => normalizeSearchKey(alias) === normalizeSearchKey(term))
  ) || null
}

export function hasSlangTag(tags) {
  return tags.some(tag => /^(?!non[- ])(?:[a-z0-9]+[ -])*slang$/i.test(tag.trim()))
}

export function hasConversationalTag(tags, term) {
  return hasSlangTag(tags) || (normalizeSearchKey(term).includes(' ') &&
    tags.some(tag => /^(informal|colloquial|idiom|idiomatic)$/i.test(tag.trim())))
}

function slangSenses(senses = [], inheritedTags = [], term = '') {
  return senses.flatMap(sense => {
    const tags = [...inheritedTags, ...(sense.tags || [])]
    // Some providers keep "Internet slang" only in the definition's usage label.
    const label = sense.definition?.match(/^\(([^)]+)\)/)?.[1] || ''
    const labels = label.split(',').map(tag => tag.trim())
    if (hasConversationalTag(labels, term)) tags.push(...labels)
    const isSlang = hasConversationalTag(tags, term)
    const matches = typeof sense.definition === 'string' && isSlang
      ? [{ definition: sense.definition, tags: [...new Set(tags)], examples: sense.examples || [] }]
      : []
    return [...matches, ...slangSenses(sense.subsenses, tags, term)]
  })
}

export function filterSlangEntries(entries = [], term = '') {
  return entries.filter(entry => entry.language?.code === 'en').flatMap(entry => {
    const senses = slangSenses(entry.senses, [], term)
    senses.sort((a, b) => Number(hasSlangTag(b.tags)) - Number(hasSlangTag(a.tags)))
    return senses.length ? [{ ...entry, senses }] : []
  })
}

export function parseDictionary(data, term) {
  const curated = bundledTerm(term)
  if (curated) return curated
  const senses = filterSlangEntries(data.entries, term).flatMap(entry => entry.senses)
  senses.sort((a, b) => Number(hasSlangTag(b.tags)) - Number(hasSlangTag(a.tags)))
  const sense = senses[0]
  if (!sense) return null
  return { term, definition: sense.definition, example: sense.examples?.[0] || '',
    category: sense.tags.join(', '),
    origin: '', related: [], source: 'dictionary', sourceLabel: 'Wiktionary via FreeDictionaryAPI (CC BY-SA 4.0)',
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}#English` }
}

export async function lookupDictionary(term) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`/api/lookup?${new URLSearchParams({ term })}`, { signal: controller.signal })
    if (response.status === 404) return null
    if (!response.ok) throw new Error('Dictionary lookup is unavailable. Please try again shortly.')
    return parseDictionary(await response.json(), term)
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Lookup took too long. Please try again.')
    throw error
  } finally { clearTimeout(timer) }
}
