/**
 * AI service — Claude (Anthropic) primary, Gemini fallback.
 *
 * Strategy:
 *  1. Check localStorage cache — no API call if term was looked up before (7-day TTL)
 *  2. Try Claude (claude-haiku — fast, cheap, high rate limits)
 *  3. If Claude fails (rate limit / key missing / error), try Gemini
 *  4. If both fail, throw GeminiRateLimitError so callers degrade gracefully
 *
 * Each provider has its own 60-second client-side cooldown after a 429.
 * isGeminiRateLimited() returns true only when BOTH providers are in cooldown.
 *
 * Env vars needed in Vercel:
 *   VITE_ANTHROPIC_API_KEY   — primary
 *   VITE_GEMINI_API_KEY      — fallback
 */

import { referenceDocuments } from '../data/referenceDocuments'

// ── Provider config ───────────────────────────────────────────────────────────

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const GEMINI_KEY    = import.meta.env.VITE_GEMINI_API_KEY

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const GEMINI_URL    = GEMINI_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`
  : null

// ── Per-provider rate-limit cooldowns (60s after a 429) ──────────────────────

const RATE_LIMIT_COOLDOWN_MS = 60_000
let claudeRateLimitUntil = 0
let geminiRateLimitUntil = 0

function isClaudeRateLimited() { return Date.now() < claudeRateLimitUntil }
function isGeminiProviderLimited() { return Date.now() < geminiRateLimitUntil }

/** True when ALL AI providers are on cooldown — callers show soft "AI paused" note. */
export function isGeminiRateLimited() {
  return isClaudeRateLimited() && isGeminiProviderLimited()
}

// ── Shared lookup cache (localStorage, 7-day TTL) ────────────────────────────

const LOOKUP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

function termCacheKey(term) {
  return `aave_lookup_${term.toLowerCase().replace(/\s+/g, '_')}`
}

function getCachedLookup(term) {
  try {
    const raw = localStorage.getItem(termCacheKey(term))
    if (!raw) return null
    const { data, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > LOOKUP_CACHE_TTL) return null
    return data
  } catch { return null }
}

function setCachedLookup(term, data) {
  try {
    localStorage.setItem(termCacheKey(term), JSON.stringify({ data, savedAt: Date.now() }))
  } catch {}
}

// ── Shared prompt ─────────────────────────────────────────────────────────────

function buildReferenceContext() {
  if (!referenceDocuments.length) return ''
  const lines = ['\nReference material (treat as authoritative):']
  for (const e of referenceDocuments) {
    if (!e.word) continue
    let line = `• ${e.word}: ${e.meaning || ''}`
    if (e.context) line += ` | Context: ${e.context}`
    if (e.origin)  line += ` | Origin: ${e.origin}`
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
If the term appears in the reference material below, use that as your primary source.`

// ── Error class (kept for backwards compat with termLookup + SearchBar) ───────

export class GeminiRateLimitError extends Error {
  constructor(msg = 'all_providers_rate_limited') { super(msg) }
}

// ── Provider: Claude ──────────────────────────────────────────────────────────

async function callClaude(prompt, temperature = 0.3, maxTokens = 512) {
  if (!ANTHROPIC_KEY) {
    console.warn('[AI] Claude: VITE_ANTHROPIC_API_KEY not set — skipping')
    throw new Error('claude_key_missing')
  }
  if (isClaudeRateLimited()) {
    const secsLeft = Math.ceil((claudeRateLimitUntil - Date.now()) / 1000)
    console.warn(`[AI] Claude: rate-limit cooldown active (${secsLeft}s remaining)`)
    throw new Error('claude_rate_limited')
  }

  console.info('[AI] Claude: calling API…')
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type':                          'application/json',
      'x-api-key':                             ANTHROPIC_KEY,
      'anthropic-version':                     '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (response.status === 429) {
    claudeRateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    console.warn('[AI] Claude: 429 — cooldown set for 60s')
    throw new Error('claude_rate_limited')
  }
  if (response.status === 401) {
    console.error('[AI] Claude: 401 Unauthorized — check VITE_ANTHROPIC_API_KEY in Vercel env vars')
    throw new Error('claude_unauthorized')
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`[AI] Claude: HTTP ${response.status}`, body)
    throw new Error(`claude_http_${response.status}`)
  }

  const data  = await response.json()
  const text  = data?.content?.[0]?.text
  if (!text) {
    console.error('[AI] Claude: empty response body', data)
    throw new Error('claude_empty_response')
  }
  console.info('[AI] Claude: success')
  return text
}

// ── Provider: Gemini ──────────────────────────────────────────────────────────

async function callGemini(prompt, temperature = 0.3, maxTokens = 512) {
  if (!GEMINI_KEY) {
    console.warn('[AI] Gemini: VITE_GEMINI_API_KEY not set — skipping')
    throw new Error('gemini_key_missing')
  }
  if (isGeminiProviderLimited()) {
    const secsLeft = Math.ceil((geminiRateLimitUntil - Date.now()) / 1000)
    console.warn(`[AI] Gemini: rate-limit cooldown active (${secsLeft}s remaining)`)
    throw new Error('gemini_rate_limited')
  }

  console.info('[AI] Gemini: calling API…')
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  })

  if (response.status === 429) {
    geminiRateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    console.warn('[AI] Gemini: 429 — cooldown set for 60s')
    throw new Error('gemini_rate_limited')
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`[AI] Gemini: HTTP ${response.status}`, body)
    throw new Error(`gemini_http_${response.status}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    console.error('[AI] Gemini: empty response body', data)
    throw new Error('gemini_empty_response')
  }
  console.info('[AI] Gemini: success')
  return text
}

// ── Unified AI caller: Claude → Gemini fallback ───────────────────────────────

async function callAI(prompt, temperature = 0.3, maxTokens = 512) {
  // Try Claude first
  try {
    return { text: await callClaude(prompt, temperature, maxTokens), provider: 'claude' }
  } catch (claudeErr) {
    console.warn(`[AI] Claude failed (${claudeErr.message}), trying Gemini fallback…`)
  }

  // Fallback to Gemini
  try {
    return { text: await callGemini(prompt, temperature, maxTokens), provider: 'gemini' }
  } catch (geminiErr) {
    console.error(`[AI] Gemini also failed (${geminiErr.message}). Both providers unavailable.`)
    throw new GeminiRateLimitError('all_providers_failed')
  }
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function lookupWithGemini(term) {
  // 1. Check cache — avoids any API call for previously looked-up terms
  const cached = getCachedLookup(term)
  if (cached) {
    console.info(`[AI] Cache hit for "${term}"`)
    return cached
  }

  // 2. Both providers in cooldown — skip API entirely
  if (isGeminiRateLimited()) throw new GeminiRateLimitError()

  const systemPrompt = BASE_PROMPT + buildReferenceContext()
  const fullPrompt   = `${systemPrompt}\n\nTerm to define: "${term}"`

  const { text, provider } = await callAI(fullPrompt, 0.3, 512)
  const parsed = parseJSON(text)

  if (parsed.error) {
    console.info(`[AI] ${provider}: term not in AAVE lexicon — "${term}"`)
    return null
  }

  const result = { ...parsed, source: 'ai' }
  setCachedLookup(term, result)
  return result
}

/**
 * Generates a fresh, humorous daily fact about a word.
 * Cached per term per local calendar day so it never regenerates on reload.
 * userSeed nudges the model to vary output across users.
 */
export async function generateWordFact(term, userSeed = '') {
  if (!ANTHROPIC_KEY && !GEMINI_KEY) return null
  if (isGeminiRateLimited()) return null  // all AI paused — silently skip

  const slug     = term.toLowerCase().replace(/\s+/g, '_')
  const cacheKey = `aave_fact_${slug}`
  const seenKey  = `aave_fact_seen_${slug}`

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (cached?.date === today) return cached.fact
  } catch {}

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
    const { text } = await callAI(prompt, 0.9, 200)
    const fact = text.trim()
    if (!fact) return null

    try { localStorage.setItem(cacheKey, JSON.stringify({ fact, date: today })) } catch {}
    try { localStorage.setItem(seenKey, JSON.stringify([fact, ...seenFacts].slice(0, 5))) } catch {}
    return fact
  } catch {
    return null
  }
}
