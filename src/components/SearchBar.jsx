import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { lookupTerm, sanitiseInput } from '../services/termLookup'
import { GeminiRateLimitError } from '../services/gemini'
import { streakService } from '../services/streakService'
import { dbHelpers } from '../services/firebase'
import { referenceDocuments } from '../data/referenceDocuments'
import TermCard from './TermCard'

const BADGE_LOOKUP = {
  first_look:      { threshold: 1  },
  word_collector:  { threshold: 10 },
  culture_scholar: { threshold: 50 },
}

// ── Fuzzy typeahead (same de-elongation used in termLookup) ──────────────────

function deElongate(s) { return s.replace(/(.)\1{2,}/g, '$1$1') }

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

function getSuggestions(rawQuery, max = 5) {
  const q = deElongate(rawQuery.trim().toLowerCase())
  if (q.length < 2) return []

  const scored = []
  for (const e of referenceDocuments) {
    if (!e.word) continue
    const c = deElongate(e.word.toLowerCase())
    if (c.startsWith(q) || q.startsWith(c)) { scored.push({ word: e.word, score: -1 }); continue }
    const dist = editDistance(q, c) / Math.max(q.length, c.length)
    if (dist <= 0.5) scored.push({ word: e.word, score: dist })
  }

  scored.sort((a, b) => a.score - b.score)
  const seen = new Set()
  return scored.filter(r => !seen.has(r.word) && seen.add(r.word))
               .slice(0, max).map(r => r.word)
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SearchBar({ user, onSearch }) {
  const [query,           setQuery]           = useState('')
  const [result,          setResult]          = useState(null)
  const [correctedFrom,   setCorrectedFrom]   = useState(null)
  const [status,          setStatus]          = useState('idle')
  const [errorMsg,        setErrorMsg]        = useState('')
  const [suggestions,     setSuggestions]     = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef      = useRef(null)
  const suggestionsRef = useRef(null)

  // Debounced typeahead
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return }
    const t = setTimeout(() => setSuggestions(getSuggestions(query)), 120)
    return () => clearTimeout(t)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!inputRef.current?.contains(e.target) && !suggestionsRef.current?.contains(e.target))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const runSearch = async (raw) => {
    const term = sanitiseInput(raw)
    if (!term) return

    setQuery(term)
    setShowSuggestions(false)
    setStatus('loading')
    setResult(null)
    setCorrectedFrom(null)
    setErrorMsg('')

    // ── Record streak on ANY search attempt ──────────────────────────────────
    // Streaks measure daily engagement, not search success.
    // This fires in the background so it never blocks the UI.
    if (user) streakService.recordActivity(user.uid).catch(() => {})

    try {
      const res = await lookupTerm(term, user?.uid ?? null)

      if (!res) {
        setStatus('not_found')
        return
      }

      setResult(res)
      setCorrectedFrom(res.correctedFrom || null)
      setStatus('idle')

      if (user) {
        await dbHelpers.addXP(user.uid, 2).catch(() => {})
        await dbHelpers.updateRecentActivity(user.uid, 'added', res.termData?.term || term).catch(() => {})

        const userDoc = await dbHelpers.getUserDoc(user.uid)
        const count = userDoc?.wordsLookedUp || 0
        for (const [badgeId, { threshold }] of Object.entries(BADGE_LOOKUP)) {
          if (count >= threshold) await dbHelpers.awardBadge(user.uid, badgeId)
        }
      }

      onSearch?.()
    } catch (err) {
      console.error('Search error:', err)
      if (err instanceof GeminiRateLimitError) {
        setErrorMsg(
          'AI lookup is rate-limited right now. Most AAVE terms are available without AI — try the suggestions below or check your spelling.'
        )
      } else {
        setErrorMsg('Something went wrong. Check your connection and try again.')
      }
      setStatus('error')
    }
  }

  const handleSubmit = (e) => { e.preventDefault(); runSearch(query) }

  // Suggestions to show in the not-found state (pre-computed from current query)
  const notFoundSuggestions = status === 'not_found' ? getSuggestions(query, 4) : []

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search any AAVE term…"
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              className="w-full rounded-xl border border-slate-600 bg-[#1E293B] pl-11 pr-4 py-3.5 text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all text-base"
            />

            {/* Typeahead dropdown */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.ul
                  ref={suggestionsRef}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
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
            {status === 'loading'
              ? <Loader2 size={18} className="animate-spin" />
              : <Search size={18} />}
            <span className="hidden sm:inline">{status === 'loading' ? 'Searching…' : 'Search'}</span>
          </button>
        </div>
      </form>

      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div key="loading" className="mt-6 flex items-center justify-center gap-3 text-slate-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 size={20} className="animate-spin text-amber-500" />
            <span>Looking that up…</span>
          </motion.div>
        )}

        {status === 'not_found' && (
          <motion.div key="not_found" className="mt-6 rounded-xl border border-slate-700/50 bg-[#1E293B] p-5"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-white">Term not found</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  "{query.trim()}" isn't in the AAVE lexicon we know of.
                </p>
                {notFoundSuggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-2">Did you mean…</p>
                    <div className="flex flex-wrap gap-2">
                      {notFoundSuggestions.map((w) => (
                        <button
                          key={w}
                          onClick={() => runSearch(w)}
                          className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors capitalize"
                        >
                          {w} <ArrowRight size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div key="error"
            className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-5"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{errorMsg}</p>
                {suggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggestions.slice(0, 4).map((w) => (
                      <button
                        key={w}
                        onClick={() => runSearch(w)}
                        className="flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:text-white transition-colors capitalize"
                      >
                        {w} <ArrowRight size={10} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.div key="result" className="mt-6"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Auto-correction banner */}
            {correctedFrom && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                <ArrowRight size={12} />
                Showing results for <span className="font-semibold capitalize mx-1">"{result.termData.term}"</span>
                — searched for "{correctedFrom}"
              </div>
            )}
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
