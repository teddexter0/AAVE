import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bundledTerm, hasSlangTag, normalizeTerm, withTimeout } from './lookupCore.js'

async function loadLookup({ dictionary, db = {}, entries = [] } = {}) {
  const source = (await readFile(new URL('./termLookup.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '')
  const factory = new Function('dbHelpers', 'bundledTerm', 'hasSlangTag', 'lookupDictionary', 'normalizeTerm', 'withTimeout', 'seedTerms', 'referenceDocuments', source.replace(/export /g, '') + '\nreturn lookupTerm')
  return factory({ getTermBySlug: async () => null, ...db }, bundledTerm, hasSlangTag, dictionary || (async () => null), normalizeTerm, withTimeout, [], entries)
}

test('an exact typed acronym is returned without AI or database access', async () => {
  const lookup = await loadLookup({ dictionary: () => assert.fail('unnecessary network'), db: { getTermBySlug: () => assert.fail('unnecessary database') } })
  assert.equal((await lookup(' IJBOL ')).termData.term, 'ijbol')
})

test('a similar local term and a legacy standard definition cannot replace the exact slang lookup', async () => {
  let requested
  const lookup = await loadLookup({
    entries: [{ word: 'cap', meaning: 'A lie' }],
    db: { getTermBySlug: async () => ({ source: 'dictionary', category: 'noun', definition: 'Text under an image' }) },
    dictionary: async term => { requested = term; return null },
  })
  assert.equal(await lookup('caption'), null)
  assert.equal(requested, 'caption')
})

test('an older explicitly tagged slang sense can still be used from Firestore', async () => {
  const cached = { term: 'example', definition: 'A slang meaning', source: 'dictionary', category: 'dated, slang' }
  const lookup = await loadLookup({
    db: { getTermBySlug: async () => cached },
    dictionary: () => assert.fail('unnecessary network'),
  })
  assert.deepEqual((await lookup('example')).termData, cached)
})

test('failed word-bank storage does not turn a definition into a search failure', async () => {
  const lookup = await loadLookup({ db: { saveTerm: async () => { throw new Error('offline') } } })
  const result = await lookup('ijbol', 'test-user')
  assert.equal(result.termData.term, 'ijbol')
  assert.equal(await result.savePromise, false)
})

test('dictionary outage remains an error rather than a false not-found result', async () => {
  const lookup = await loadLookup({ dictionary: async () => { throw new Error('Provider unavailable') } })
  await assert.rejects(lookup('unlisted'), /unavailable/)
})
