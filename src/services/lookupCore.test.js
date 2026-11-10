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
    assert.equal(res.code, 200)
    assert.equal(res.data.found, false)
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

test('phrase variants match the same sourced entry, including punctuation and curly apostrophes', () => {
  for (const input of ["I'm tapped in", 'I’m tapped in!', 'im tapped in', 'tapped-in', '“I am tapped in.”']) {
    assert.equal(bundledTerm(input)?.term, "I'm tapped in", input)
  }
  for (const input of ['hit the pentagon', 'They hit the Pentagon!', 'they hit the fucking pentagon']) {
    assert.equal(bundledTerm(input)?.term, 'they hit the Pentagon', input)
  }
  assert.equal(bundledTerm('pentagon'), null)
})

test('dictionary recognizes usage labels and nested slang senses without leaking ordinary meanings', () => {
  const data = { entries: [{ language: { code: 'en' }, senses: [
    { definition: 'Standard meaning', subsenses: [
      { definition: 'A formal subsense' },
      { definition: '(Internet slang, humorous) A meme reaction', tags: ['Internet', 'humorous'] },
    ] },
  ] }] }
  const entry = parseDictionary(data, 'new meme')
  assert.match(entry.definition, /A meme reaction/)
  assert.match(entry.category, /slang/)
  assert.equal(parseDictionary({ entries: [{ language: { code: 'en' }, senses: [
    { definition: '(non-slang) A standard meaning' },
  ] }] }, 'standard'), null)
})

test('API serves curated phrases without depending on an upstream dictionary', async () => {
  const original = global.fetch
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  try {
    global.fetch = () => assert.fail('unnecessary upstream lookup')
    for (const term of ['hit the pentagon', 'I’m tapped in!']) {
      await handler({ method: 'GET', query: { term } }, res)
      assert.equal(res.code, 200)
      assert.equal(res.data.found, true)
      assert.equal(res.data.termData.source, 'curated')
      assert.match(res.data.termData.sourceUrl, /^https:/)
    }
    await handler({ method: 'GET', query: { term: '!!!' } }, res)
    assert.equal(res.code, 400)
  } finally { global.fetch = original }
})

test('an upstream no-match returns an explicit empty result instead of an HTTP failure', async () => {
  const original = global.fetch
  const headers = {}
  const res = { setHeader(name, value) { headers[name] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  try {
    global.fetch = async () => ({ status: 404 })
    await handler({ method: 'GET', query: { term: 'unlisted phrase' } }, res)
    assert.equal(res.code, 200)
    assert.deepEqual(res.data, { found: false, entries: [] })
    assert.equal(headers['Cache-Control'], 'no-store')
  } finally { global.fetch = original }
})

test('hyphenated and inflected conversational aliases keep an accurate idiom label', () => {
  for (const term of ['knee-jerking', 'knee jerking', 'KNEE–JERKING!', 'knee jerk reactions']) {
    const entry = bundledTerm(term)
    assert.equal(entry?.term, 'knee-jerk reaction', term)
    assert.equal(entry.category, 'conversational idiom')
    assert.match(entry.sourceUrl, /dictionary.cambridge.org/)
  }
})

test('multiword conversational senses are eligible while ordinary dictionary senses stay excluded', () => {
  const data = { entries: [{ language: { code: 'en' }, senses: [
    { definition: 'A formal definition' },
    { definition: '(idiomatic) A conversational expression', tags: ['idiomatic'] },
  ] }] }
  assert.match(parseDictionary(data, 'new expression').definition, /conversational/)
  assert.equal(parseDictionary(data, 'formalword'), null)
})
