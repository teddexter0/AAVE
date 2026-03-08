import { referenceDocuments } from '../data/referenceDocuments'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

function buildReferenceContext() {
  const allEntries = referenceDocuments.flatMap((doc) => doc.entries || [])
  if (allEntries.length === 0) return ''

  const lines = ['\nReference material from community documents (treat these as authoritative):']
  for (const doc of referenceDocuments) {
    const entries = doc.entries || []
    if (entries.length === 0) continue
    lines.push(`\n[${doc.name}]`)
    for (const e of entries) {
      if (!e.word) continue
      let line = `• ${e.word}: ${e.meaning || ''}`
      if (e.context) line += ` | Context: ${e.context}`
      if (e.origin) line += ` | Origin: ${e.origin}`
      lines.push(line)
    }
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

export async function lookupWithGemini(term) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  const systemPrompt = BASE_PROMPT + buildReferenceContext()

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text: `Term to define: "${term}"` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!raw) throw new Error('Empty response from Gemini')

  // Strip any markdown fences if present
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  const parsed = JSON.parse(cleaned)

  if (parsed.error) {
    return null // Term not in AAVE lexicon
  }

  return {
    ...parsed,
    source: 'ai',
  }
}
