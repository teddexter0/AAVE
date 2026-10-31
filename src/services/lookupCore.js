export const normalizeTerm = term => String(term).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

export function withTimeout(promise, ms) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Lookup timed out. Please try again.')), ms)
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
  return entries.find(entry => normalizeTerm(entry.term) === normalizeTerm(term)) || null
}

export function parseDictionary(data, term) {
  const entries = (data.entries || []).filter(entry => entry.language?.code === 'en')
  const senses = entries.flatMap(entry => (entry.senses || []).filter(s => typeof s.definition === 'string').map(s => ({ ...s, partOfSpeech: entry.partOfSpeech })))
  senses.sort((a, b) => Number((b.tags || []).some(t => /slang|informal|internet/i.test(t))) - Number((a.tags || []).some(t => /slang|informal|internet/i.test(t))))
  const sense = senses[0]
  if (!sense) return null
  return { term, definition: sense.definition, example: sense.examples?.[0] || '',
    category: (sense.tags || []).join(', ') || sense.partOfSpeech || 'expression',
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
