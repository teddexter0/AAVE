import test from 'node:test'
import assert from 'node:assert/strict'
import { bundledTerm, normalizeTerm, parseDictionary, lookupDictionary, withTimeout } from './lookupCore.js'
import handler from '../../api/lookup.js'

test('typed acronym and whole phrases normalize correctly', () => {
  assert.match(bundledTerm(' IJBOL ').definition, /burst out laughing/)
  assert.equal(bundledTerm('ijbol').category, 'internet slang')
  assert.equal(normalizeTerm('  Read   the Room '), 'read the room')
  assert.equal(bundledTerm('unlisted'), null)
})
test('dictionary returns only senses explicitly labeled as slang', () => {
  const entry = parseDictionary({ entries: [{ language: { code: 'en' }, senses: [
    { definition: 'Ordinary meaning' },
    { definition: 'Informal meaning', tags: ['informal'] },
    { definition: 'Slang meaning', tags: ['slang', 'dated'], examples: ['Example.'] }
  ] }] }, 'new phrase')
  assert.equal(entry.definition, 'Slang meaning')
  assert.equal(entry.example, 'Example.')
  assert.equal(parseDictionary({ entries: [{ language: { code: 'en' }, senses: [
    { definition: 'A title or explanation for an image' },
    { definition: 'An informal sense', tags: ['informal'] },
  ] }] }, 'caption'), null)
  assert.equal(parseDictionary({ entries: [] }, 'unknown'), null)
})
test('missing entry and network failure remain distinct', async () => {
  const original = global.fetch
  try {
    global.fetch = async () => ({ status: 404 })
    assert.equal(await lookupDictionary('unknown'), null)
    global.fetch = async () => ({ status: 502, ok: false })
    await assert.rejects(lookupDictionary('unknown'), /unavailable/)
  } finally { global.fetch = original }
})
test('database timeout does not wait indefinitely', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /timed out/)
})
test('proxy validates input and keeps requests on the dictionary host', async () => {
  const original = global.fetch
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  try {
    global.fetch = async url => { assert.equal(new URL(url).hostname, 'freedictionaryapi.com'); return { ok: true, json: async () => ({ entries: [] }) } }
    await handler({ method: 'GET', query: { term: ['bad'] } }, res)
    assert.equal(res.code, 400)
    await handler({ method: 'GET', query: { term: 'https://example.com/private' } }, res)
    assert.equal(res.code, 404)
    global.fetch = async () => ({ ok: true, json: async () => ({ entries: [
      { language: { code: 'en' }, senses: [{ definition: 'Standard meaning' }] },
      { language: { code: 'en' }, senses: [
        { definition: 'Another standard meaning' },
        { definition: 'A slang meaning', tags: ['Internet slang'] },
      ] },
    ] }) })
    await handler({ method: 'GET', query: { term: 'example' } }, res)
    assert.equal(res.code, 200)
    assert.deepEqual(res.data.entries.flatMap(entry => entry.senses.map(sense => sense.definition)), ['A slang meaning'])
    global.fetch = async () => { throw new Error('offline') }
    await handler({ method: 'GET', query: { term: 'missing' } }, res)
    assert.equal(res.code, 502)
  } finally { global.fetch = original }
})
