import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BookOpen, Brain, Flame, Trophy, ChevronRight } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import StreakBadge from '../components/StreakBadge'
import BadgeDisplay from '../components/BadgeDisplay'

export default function Dashboard({ user, userDoc }) {
  const [recentWords, setRecentWords] = useState([])

  useEffect(() => {
    if (!user) return
    dbHelpers.getWordBank(user.uid).then((words) => setRecentWords(words.slice(0, 5)))
  }, [user])

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your dashboard.</p>
      </div>
    )
  }

  const stats = [
    {
      label: 'Day Streak',
      value: userDoc?.streak || 0,
      icon: Flame,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/20',
    },
    {
      label: 'Words Looked Up',
      value: userDoc?.wordsLookedUp || 0,
      icon: BookOpen,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: 'Badges Earned',
      value: (userDoc?.badges || []).length,
      icon: Trophy,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
  ]

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-white mb-1">
          Welcome back{userDoc?.displayName ? `, ${userDoc.displayName.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-slate-400 mb-8">Here's how you're doing.</p>

        {/* Streak hero */}
        <div className="mb-8 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-300/70 mb-1">Current streak</p>
            <StreakBadge streak={userDoc?.streak || 0} size="lg" />
            <p className="text-xs text-slate-400 mt-2">
              {userDoc?.streak === 0
                ? 'Search a term today to start your streak!'
                : 'Keep it up — don\'t break the chain!'}
            </p>
          </div>
          <Flame size={52} className="text-orange-400/30" fill="currentColor" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-xl border p-4 text-center ${bg}`}>
              <Icon size={22} className={`mx-auto mb-2 ${color}`} />
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link
            to="/"
            className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 hover:border-amber-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <BookOpen size={20} className="text-amber-500" />
              <span className="text-sm font-medium text-white">Search a term</span>
            </div>
            <ChevronRight size={16} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
          </Link>
          <Link
            to="/word-bank"
            className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 hover:border-amber-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Brain size={20} className="text-amber-500" />
              <span className="text-sm font-medium text-white">My word bank</span>
            </div>
            <ChevronRight size={16} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
          </Link>
        </div>

        {/* Recent terms */}
        {recentWords.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Recent lookups</h2>
              <Link to="/word-bank" className="text-xs text-amber-400 hover:text-amber-300">See all</Link>
            </div>
            <div className="space-y-2">
              {recentWords.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-[#1E293B] px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-white capitalize">{w.term}</span>
                  <span className="text-xs text-slate-500">{formatRelative(w.lookedUpAt?.toDate?.())}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Badges</h2>
          <BadgeDisplay earnedBadges={userDoc?.badges || []} />
        </div>
      </motion.div>
    </main>
  )
}

function formatRelative(date) {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return date.toLocaleDateString()
}
