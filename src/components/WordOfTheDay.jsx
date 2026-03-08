import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Loader2, BookmarkPlus, Check, Zap, CheckCircle, XCircle } from 'lucide-react'
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
  const cycle = Math.floor(daysSinceEpoch / n)
  const pos = daysSinceEpoch % n
  const shuffled = seededShuffle(referenceDocuments, cycle)
  const entry = shuffled[pos]
  return {
    term: entry.word,
    definition: entry.meaning,
    example: entry.context || '',
    origin: entry.origin || '',
  }
}

/** Build today's challenge options: correct + 3 wrong, seeded so same for everyone today */
function buildChallengeOptions(correctDef, correctTerm) {
  const daysSinceEpoch = Math.floor(Date.now() / MS_PER_DAY)
  const pool = referenceDocuments.filter(e => e.word && e.word.toLowerCase() !== correctTerm.toLowerCase() && e.meaning)
  const shuffled = seededShuffle(pool, daysSinceEpoch + 99999) // different seed from WOTD
  const wrong = shuffled.slice(0, 3).map(e => e.meaning)
  const all = [correctDef, ...wrong]
  return seededShuffle(all, daysSinceEpoch + 12345)
}

const WOTD_CACHE_KEY = 'aave_wotd'
const CHALLENGE_CACHE_KEY = 'aave_wotd_challenge'

function getCachedWotd() {
  try {
    const raw = localStorage.getItem(WOTD_CACHE_KEY)
    if (!raw) return null
    const { date, term } = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    return date === today ? term : null
  } catch { return null }
}

function cacheWotd(term) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(WOTD_CACHE_KEY, JSON.stringify({ date: today, term }))
  } catch {}
}

function getCachedChallenge() {
  try {
    const raw = localStorage.getItem(CHALLENGE_CACHE_KEY)
    if (!raw) return null
    const { date, correct } = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    return date === today ? { done: true, correct } : null
  } catch { return null }
}

function cacheChallenge(correct) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(CHALLENGE_CACHE_KEY, JSON.stringify({ date: today, correct }))
  } catch {}
}

export default function WordOfTheDay({ user }) {
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Challenge state
  const [challengePhase, setChallengePhase] = useState('idle') // idle | active | done
  const [challengeOptions, setChallengeOptions] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [challengeCorrect, setChallengeCorrect] = useState(null)

  useEffect(() => {
    const cached = getCachedWotd()
    if (cached) {
      setTerm(cached)
      setLoading(false)
      const challenge = getCachedChallenge()
      if (challenge) { setChallengePhase('done'); setChallengeCorrect(challenge.correct) }
      return
    }

    const timer = setTimeout(() => {
      const fallback = getDailyFallback()
      setTerm(fallback)
      cacheWotd(fallback)
      setLoading(false)
    }, 4000)

    dbHelpers.getWordOfTheDay()
      .then(result => { const word = result ?? getDailyFallback(); setTerm(word); cacheWotd(word) })
      .catch(() => { const fallback = getDailyFallback(); setTerm(fallback); cacheWotd(fallback) })
      .finally(() => {
        clearTimeout(timer)
        setLoading(false)
        const challenge = getCachedChallenge()
        if (challenge) { setChallengePhase('done'); setChallengeCorrect(challenge.correct) }
      })
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

  const startChallenge = () => {
    if (!term) return
    setChallengeOptions(buildChallengeOptions(term.definition, term.term))
    setChallengePhase('active')
  }

  const handleChallengeAnswer = async (option) => {
    if (selectedAnswer !== null) return
    const correct = option === term.definition
    setSelectedAnswer(option)
    setChallengeCorrect(correct)
    cacheChallenge(correct)

    if (correct && user) {
      await dbHelpers.addXP(user.uid, 5).catch(() => {})
    }

    setTimeout(() => setChallengePhase('done'), 1400)
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
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

      {/* Daily Challenge */}
      <AnimatePresence mode="wait">
        {challengePhase === 'idle' && (
          <motion.button
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={startChallenge}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 py-3 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Zap size={14} fill="currentColor" />
            Daily Challenge — test yourself (+5 XP)
          </motion.button>
        )}

        {challengePhase === 'active' && (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-xl border border-slate-700/50 bg-[#1E293B] p-4"
          >
            <p className="text-sm font-semibold text-white mb-3">
              What does <span className="text-amber-400">"{term.term}"</span> mean?
            </p>
            <div className="space-y-2">
              {challengeOptions.map((opt) => {
                let style = 'border-slate-600 bg-[#0F172A] text-slate-300 hover:border-amber-500/40'
                if (selectedAnswer !== null) {
                  if (opt === term.definition) style = 'border-green-500 bg-green-500/10 text-green-300'
                  else if (opt === selectedAnswer) style = 'border-red-500 bg-red-500/10 text-red-300'
                }
                return (
                  <button
                    key={opt}
                    onClick={() => handleChallengeAnswer(opt)}
                    disabled={selectedAnswer !== null}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-xs transition-all flex items-center justify-between gap-2 ${style}`}
                  >
                    <span className="leading-snug">{opt}</span>
                    {selectedAnswer !== null && opt === term.definition && <CheckCircle size={14} className="shrink-0 text-green-400" />}
                    {selectedAnswer !== null && opt === selectedAnswer && opt !== term.definition && <XCircle size={14} className="shrink-0 text-red-400" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}

        {challengePhase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
              challengeCorrect
                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                : 'border-slate-700/50 bg-[#1E293B] text-slate-400'
            }`}
          >
            {challengeCorrect ? (
              <><CheckCircle size={15} className="text-green-400 shrink-0" /> Challenge complete! {user ? '+5 XP earned' : 'Sign in to earn XP'}</>
            ) : (
              <><XCircle size={15} className="text-slate-500 shrink-0" /> Better luck tomorrow — the answer was: <span className="text-white ml-1 truncate">{term.definition}</span></>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
