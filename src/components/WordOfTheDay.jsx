import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Star, Loader2, BookmarkPlus, Check } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import { referenceDocuments } from '../data/referenceDocuments'
import TermCard from './TermCard'

const MS_PER_DAY = 86400000

/** Fast 32-bit PRNG seeded by a number — deterministic, no two cycles same order */
function seededRng(seed) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000
  }
}

/** Fisher-Yates shuffle using the given seed — returns a new array */
function seededShuffle(arr, seed) {
  const rand = seededRng(seed)
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function getDailyFallback() {
  if (!referenceDocuments.length) return null
  const n = referenceDocuments.length
  const daysSinceEpoch = Math.floor(Date.now() / MS_PER_DAY)
  // Which full rotation through all n words are we on?
  const cycle = Math.floor(daysSinceEpoch / n)
  // Position within the current rotation
  const pos = daysSinceEpoch % n
  // Each cycle gets its own shuffle so the sequence never repeats identically
  const shuffled = seededShuffle(referenceDocuments, cycle)
  const entry = shuffled[pos]
  return {
    term: entry.word,
    definition: entry.meaning,
    example: entry.context || '',
    origin: entry.origin || '',
  }
}

const WOTD_CACHE_KEY = 'aave_wotd'

function getCachedWotd() {
  try {
    const raw = localStorage.getItem(WOTD_CACHE_KEY)
    if (!raw) return null
    const { date, term } = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    return date === today ? term : null
  } catch {
    return null
  }
}

function cacheWotd(term) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(WOTD_CACHE_KEY, JSON.stringify({ date: today, term }))
  } catch {}
}

export default function WordOfTheDay({ user }) {
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Serve from localStorage cache if already computed today — no flicker, no network
    const cached = getCachedWotd()
    if (cached) {
      setTerm(cached)
      setLoading(false)
      return
    }

    const timer = setTimeout(() => {
      const fallback = getDailyFallback()
      setTerm(fallback)
      cacheWotd(fallback)
      setLoading(false)
    }, 4000)

    dbHelpers.getWordOfTheDay()
      .then(result => {
        const word = result ?? getDailyFallback()
        setTerm(word)
        cacheWotd(word)
      })
      .catch(() => {
        const fallback = getDailyFallback()
        setTerm(fallback)
        cacheWotd(fallback)
      })
      .finally(() => { clearTimeout(timer); setLoading(false) })
  }, [])

  const handleSave = async () => {
    if (!user || !term || saving || saved) return
    setSaving(true)
    try {
      const slug = term.term.toLowerCase().replace(/\s+/g, '_')
      const existing = await dbHelpers.getTermBySlug(slug)
      if (!existing) await dbHelpers.saveTerm(term)
      await dbHelpers.addToWordBank(user.uid, slug, term.term)
      setSaved(true)
    } catch (err) {
      console.error('Failed to save to word bank:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading word of the day…</span>
      </div>
    )
  }

  if (!term) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-amber-400" fill="#F59E0B" />
          <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            Word of the Day
          </span>
        </div>
        {user && (
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60
              bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:border-amber-500/40 hover:text-amber-400"
          >
            {saved ? (
              <><Check size={12} className="text-green-400" /> Saved</>
            ) : saving ? (
              <><Loader2 size={12} className="animate-spin" /> Saving…</>
            ) : (
              <><BookmarkPlus size={12} /> Save to Word Bank</>
            )}
          </button>
        )}
      </div>
      <TermCard termData={term} source="db" />
    </motion.div>
  )
}
