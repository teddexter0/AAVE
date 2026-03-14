import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Flame, Crown, Zap } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import { getLevelInfo } from '../utils/levels'

const RANK_STYLES = [
  'border-amber-500/40 bg-amber-500/10',
  'border-slate-400/30 bg-slate-400/10',
  'border-orange-700/40 bg-orange-700/10',
]

const RANK_COLORS = ['text-amber-400', 'text-slate-300', 'text-orange-400']

export default function Leaderboard({ user }) {
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbHelpers.getLeaderboard()
      .then(setLeaders)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="mb-8 flex items-center gap-3">
          <Crown size={28} className="text-amber-400" fill="#F59E0B" />
          <div>
            <h1 className="text-2xl font-bold text-white">Streak Leaderboard</h1>
            <p className="text-slate-400 text-sm">Top learners keeping the chain alive.</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl border border-slate-700/50 bg-[#1E293B] animate-pulse" />
            ))}
          </div>
        ) : leaders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400">No one's on the board yet — be first!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaders.map((entry, i) => {
              const { current: lvl } = getLevelInfo(entry.xp || 0)
              const isYou = user && entry.id === user.uid
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-4 rounded-xl border p-4 ${
                    RANK_STYLES[i] || 'border-slate-700/50 bg-[#1E293B]'
                  } ${isYou ? 'ring-1 ring-amber-500/40' : ''}`}
                >
                  <span className={`text-xl font-black w-8 text-center tabular-nums ${RANK_COLORS[i] || 'text-slate-500'}`}>
                    {i + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {entry.username
                        ? <span className="font-mono text-amber-300">@{entry.username}</span>
                        : (entry.displayName || 'Anonymous')}
                      {isYou && <span className="ml-2 text-xs text-amber-400 font-normal">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {entry.username && entry.displayName ? `${entry.displayName} · ` : ''}{lvl.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 text-purple-300 text-xs font-medium">
                      <Zap size={12} fill="currentColor" />
                      {entry.xp || 0}
                    </div>
                    <div className="flex items-center gap-1 text-orange-400 font-bold text-sm">
                      <Flame size={15} fill="currentColor" />
                      {entry.streak || 0}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-slate-600 mt-8">
          Rankings by current streak · Updates live
        </p>
      </motion.div>
    </main>
  )
}
