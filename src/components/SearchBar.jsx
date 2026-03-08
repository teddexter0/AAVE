import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { lookupTerm } from '../services/termLookup'
import { streakService } from '../services/streakService'
import { dbHelpers } from '../services/firebase'
import TermCard from './TermCard'

const BADGE_LOOKUP = {
  first_look: { threshold: 1, label: 'First Look' },
  word_collector: { threshold: 10, label: 'Word Collector' },
  culture_scholar: { threshold: 50, label: 'Culture Scholar' },
}

export default function SearchBar({ user, onSearch }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | not_found | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    const term = query.trim()
    if (!term) return

    setStatus('loading')
    setResult(null)
    setErrorMsg('')

    try {
      const res = await lookupTerm(term, user?.uid || null)

      if (!res) {
        setStatus('not_found')
        return
      }

      setResult(res)
      setStatus('idle')

      // Post-lookup side-effects for authenticated users
      if (user) {
        await streakService.recordActivity(user.uid)

        // Check and award badges based on wordsLookedUp count
        const userDoc = await dbHelpers.getUserDoc(user.uid)
        const count = userDoc?.wordsLookedUp || 0

        for (const [badgeId, { threshold }] of Object.entries(BADGE_LOOKUP)) {
          if (count >= threshold) {
            await dbHelpers.awardBadge(user.uid, badgeId)
          }
        }
      }

      onSearch?.()
    } catch (err) {
      console.error('Search error:', err)
      setErrorMsg('Something went wrong. Check your connection and try again.')
      setStatus('error')
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSearch} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any AAVE term…"
              className="w-full rounded-xl border border-slate-600 bg-[#1E293B] pl-11 pr-4 py-3.5 text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all text-base"
            />
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 size={20} className="animate-spin text-amber-500" />
            <span>Looking that up…</span>
          </motion.div>
        )}

        {status === 'not_found' && (
          <motion.div
            key="not_found"
            className="mt-6 flex items-center gap-3 rounded-xl border border-slate-700/50 bg-[#1E293B] p-5 text-slate-300"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm">{errorMsg}</p>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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
