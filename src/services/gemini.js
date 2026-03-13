import { referenceDocuments } from '../data/referenceDocuments'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

/**
 * referenceDocuments is a flat array of {word, meaning, context, origin}.
 * Fixed: previous version incorrectly assumed each item had an .entries sub-array,
 * causing the reference context to always be empty.
 */
function buildReferenceContext() {
  if (!referenceDocuments.length) return ''
  const lines = ['\nReference material from community documents (treat these as authoritative):']
  for (const e of referenceDocuments) {
    if (!e.word) continue
    let line = `• ${e.word}: ${e.meaning || ''}`
    if (e.context) line += ` | Context: ${e.context}`
    if (e.origin) line += ` | Origin: ${e.origin}`
    lines.push(line)
  }
  return lines.join('\n')
}

const BASE_PROMPT = `You are a culturally informed AAVE (African American Vernacular English) dictionary.
When given a term, respond ONLY with a JSON object in this exact format:
{
  "term": "the term as given",
  "definition": "Clear, respectful, culturally accurate definition",
  "example": "A natural usage example in a sentence",
  "origin": "Brief note on cultural/historical origin if known, otherwise omit",
  "related": ["related_term_1", "related_term_2"],
  "category": "expression | noun | verb | adjective"
}
Do not include markdown, preamble, or explanation. JSON only.
If the term is not AAVE or has no known AAVE meaning, return:
{ "error": "Term not found in AAVE lexicon" }
If the term appears in the reference material below, use that as your primary source for meaning, context, and origin.`

export class GeminiRateLimitError extends Error {
  constructor() { super('rate_limited') }
}

async function callGemini(prompt, temperature = 0.3, maxTokens = 512) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured')

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  })

  if (response.status === 429) throw new GeminiRateLimitError()
  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)

  const data = await response.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new Error('Empty response from Gemini')
  return raw
}

export async function lookupWithGemini(term) {
  const systemPrompt = BASE_PROMPT + buildReferenceContext()
  const fullPrompt = `${systemPrompt}\n\nTerm to define: "${term}"`

  const raw = await callGemini(fullPrompt, 0.3, 512)
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  if (parsed.error) return null
  return { ...parsed, source: 'ai' }
}

/**
 * Generates a fresh, humorous daily fact about a word.
 * - Cached in localStorage by term + local date so it doesn't regenerate on reload.
 * - userSeed nudges Gemini to vary output across users.
 * - seenFacts list (stored locally) tells Gemini what NOT to repeat.
 */
export async function generateWordFact(term, userSeed = '') {
  if (!GEMINI_API_KEY) return null

  const slug = term.toLowerCase().replace(/\s+/g, '_')
  const cacheKey = `aave_fact_${slug}`
  const seenKey = `aave_fact_seen_${slug}`

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // Return today's cached fact if it exists
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.date === today) return cached.fact
  } catch {}

  // Load past facts to tell Gemini not to repeat them
  let seenFacts = []
  try { seenFacts = JSON.parse(localStorage.getItem(seenKey) || '[]') } catch {}

  const avoidClause = seenFacts.length
    ? `\nDo NOT repeat or closely paraphrase any of these:\n${seenFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    : ''

  const prompt = `Give me one short (2-3 sentences max), humorous or surprising fact about the AAVE word or phrase "${term}".
Focus on: how it spread into mainstream culture, a surprising context it appears in, its evolution over time, or an interesting comparison.
Be original, conversational, and culturally respectful. Don't open with "Did you know" or similar clichés.
Return ONLY the fact text — no quotes, no preamble.${avoidClause}
Variation key: ${userSeed || 'default'}`

  try {
    const fact = (await callGemini(prompt, 0.9, 200)).trim()
    if (!fact) return null

    try { localStorage.setItem(cacheKey, JSON.stringify({ fact, date: today })) } catch {}
    try {
      localStorage.setItem(seenKey, JSON.stringify([fact, ...seenFacts].slice(0, 5)))
    } catch {}

    return fact
  } catch {
    return null
  }
}
