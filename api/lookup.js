import { bundledTerm, filterSlangEntries, normalizeTerm } from '../src/services/lookupCore.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }) }
  const raw = req.query?.term
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 120 || /[\x00-\x1f\x7f]/.test(raw)) return res.status(400).json({ error: 'Enter a word or phrase up to 120 characters.' })
  const term = normalizeTerm(raw)
  if (!term) return res.status(400).json({ error: 'Enter a slang term or phrase.' })
  const curated = bundledTerm(term)
  if (curated) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600')
    return res.status(200).json({ found: true, termData: curated, entries: [] })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6500)
  try {
    const response = await fetch(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(term)}`, { signal: controller.signal })
    if (response.status === 404) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ found: false, entries: [] })
    }
    if (!response.ok) throw new Error('Provider unavailable')
    const data = await response.json()
    if (!Array.isArray(data.entries)) throw new Error('Invalid provider response')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    const entries = filterSlangEntries(data.entries, term)
    if (!entries.length) res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ found: entries.length > 0, entries })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(502).json({ error: 'Dictionary lookup is temporarily unavailable.' })
  } finally { clearTimeout(timer) }
}
