import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { lookupTerm } from '../services/termLookup'
import { GeminiRateLimitError } from '../services/gemini'
import { streakService } from '../services/streakService'
import { dbHelpers } from '../services/firebase'
import { referenceDocuments } from '../data/referenceDocuments'
import TermCard from './TermCard'

const BADGE_LOOKUP = {
  first_look:     { threshold: 1  },
  word_collector: { threshold: 10 },
  culture_scholar:{ threshold: 50 },
}

// ── Fuzzy helpers (mirrors termLookup, runs client-side for typeahead) ────────

function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Normalise elongation: "slayyy" → "slayy", "driiip" → "driip" */
const deElongate = (s) => s.replace(/(.)\1{2,}/g, '$1$1')

function getSuggestions(rawQuery, limit = 5) {
  const q = deElongate(rawQuery.trim().toLowerCase())
  if (q.length < 2) return []

  const scored = []
  for (const e of referenceDocuments) {
    if (!e.word) continue
    const c = deElongate(e.word.toLowerCase())

    // Prefix match → best score
    if (c.startsWith(q) || q.startsWith(c)) {
      scored.push({ word: e.word, score: -1 })
      continue
    }

    const maxLen = Math.max(q.length, c.length)
    const dist = editDistance(q, c) / maxLen
    if (dist <= 0.5) scored.push({ word: e.word, score: dist })
  }

  scored.sort((a, b) => a.score - b.score)
  // Deduplicate (edge case: two entries same word)
  const seen = new Set()
  return scored.filter(r => { if (seen.has(r.word)) return false; seen.add(r.word); return true })
              .slice(0, limit)
              .map(r => r.word)
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SearchBar({ user, onSearch }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | not_found | error
  const [errorMsg, setErrorMsg] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)
  const suggestionsRef = useRef(null)

  // Debounced typeahead suggestions
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      setSuggestions(getSuggestions(query))
    }, 120)
    return () => clearTimeout(timer)
  }, [query])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!inputRef.current?.contains(e.target) && !suggestionsRef.current?.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const runSearch = async (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setQuery(trimmed)
    setShowSuggestions(false)
    setStatus('loading')
    setResult(null)
    setErrorMsg('')

    try {
      const res = await lookupTerm(trimmed, user?.uid || null)

      if (!res) {
        setStatus('not_found')
        return
      }

      setResult(res)
      setStatus('idle')

      if (user) {
        await streakService.recordActivity(user.uid)
        await dbHelpers.addXP(user.uid, 2).catch(() => {})
        await dbHelpers.updateRecentActivity(user.uid, 'added', res.termData?.term || trimmed).catch(() => {})

        const userDoc = await dbHelpers.getUserDoc(user.uid)
        const count = userDoc?.wordsLookedUp || 0
        for (const [badgeId, { threshold }] of Object.entries(BADGE_LOOKUP)) {
          if (count >= threshold) await dbHelpers.awardBadge(user.uid, badgeId)
        }
      }

      onSearch?.()
    } catch (err) {
      console.error('Search error:', err)
      setErrorMsg(
        err instanceof GeminiRateLimitError
          ? 'AI lookup is rate-limited right now. Wait a minute and try again, or check your spelling — the term might already be in our dictionary.'
          : 'Something went wrong. Check your connection and try again.'
      )
      setStatus('error')
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    runSearch(query)
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search any AAVE term…"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-600 bg-[#1E293B] pl-11 pr-4 py-3.5 text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all text-base"
            />

            {/* Typeahead dropdown */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.ul
                  ref={suggestionsRef}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-700 bg-[#1E293B] shadow-xl overflow-hidden"
                >
                  {suggestions.map((word) => (
                    <li key={word}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); runSearch(word) }}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-amber-500/10 hover:text-amber-400 transition-colors capitalize"
                      >
                        {word}
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <button
            type="submit"
            disabled={status === 'loading' || !query.trim()}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3.5 font-semibold text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Search size={18} />
            )}
            <span className="hidden sm:inline">
              {status === 'loading' ? 'Searching…' : 'Search'}
            </span>
          </button>
        </div>
      </form>

      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div
            key="loading"
            className="mt-6 flex items-center justify-center gap-3 text-slate-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <Loader2 size={20} className="animate-spin text-amber-500" />
            <span>Looking that up…</span>
          </motion.div>
        )}

        {status === 'not_found' && (
          <motion.div
            key="not_found"
            className="mt-6 flex items-center gap-3 rounded-xl border border-slate-700/50 bg-[#1E293B] p-5 text-slate-300"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            <AlertCircle size={20} className="shrink-0 text-amber-400" />
            <div>
              <p className="font-medium text-white">Term not found</p>
              <p className="text-sm text-slate-400 mt-0.5">
                "{query.trim()}" doesn't appear to be in the AAVE lexicon.
              </p>
            </div>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            key="error"
            className="mt-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-red-300"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm">{errorMsg}</p>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            className="mt-6"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            <TermCard termData={result.termData} source={result.source} />
            {!user && (
              <p className="mt-3 text-center text-sm text-slate-400">
                Sign in to save this term to your word bank and track your streak.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
