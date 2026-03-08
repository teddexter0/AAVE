import { motion } from 'framer-motion'
import { User, Mail, Calendar, BookOpen, Flame, Trophy } from 'lucide-react'
import BadgeDisplay from '../components/BadgeDisplay'
import StreakBadge from '../components/StreakBadge'

export default function ProfilePage({ user, userDoc }) {
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your profile.</p>
      </div>
    )
  }

  const joinedAt = userDoc?.joinedAt?.toDate?.()

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Avatar + info */}
        <div className="rounded-2xl border border-slate-700/50 bg-[#1E293B] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 shrink-0">
              <span className="text-2xl font-bold text-amber-400">
                {(userDoc?.displayName || user.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">
                {userDoc?.displayName || 'Anonymous'}
              </h1>
              <div className="flex items-center gap-1.5 text-slate-400 text-sm mt-1">
                <Mail size={13} />
                <span className="truncate">{user.email}</span>
              </div>
              {joinedAt && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                  <Calendar size={12} />
                  <span>Joined {joinedAt.toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <Flame size={20} className="mx-auto mb-1 text-orange-400" />
            <p className="text-2xl font-black text-white">{userDoc?.streak || 0}</p>
            <p className="text-xs text-slate-400">Day streak</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <BookOpen size={20} className="mx-auto mb-1 text-blue-400" />
            <p className="text-2xl font-black text-white">{userDoc?.wordsLookedUp || 0}</p>
            <p className="text-xs text-slate-400">Terms looked up</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <Trophy size={20} className="mx-auto mb-1 text-amber-400" />
            <p className="text-2xl font-black text-white">{(userDoc?.badges || []).length}</p>
            <p className="text-xs text-slate-400">Badges</p>
          </div>
        </div>

        {/* Current streak */}
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 flex items-center justify-between">
          <p className="text-sm text-orange-300">Current streak</p>
          <StreakBadge streak={userDoc?.streak || 0} size="sm" />
        </div>

        {/* Badges */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Badges
          </h2>
          <BadgeDisplay earnedBadges={userDoc?.badges || []} />
        </div>
      </motion.div>
    </main>
  )
}
