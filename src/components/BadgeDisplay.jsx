import { motion } from 'framer-motion'

const ALL_BADGES = [
  {
    id: 'first_look',
    emoji: '👀',
    label: 'First Look',
    description: 'Looked up your first term',
  },
  {
    id: 'word_collector',
    emoji: '📚',
    label: 'Word Collector',
    description: '10 terms in your word bank',
  },
  {
    id: 'quiz_starter',
    emoji: '🧪',
    label: 'Quiz Starter',
    description: 'Completed your first quiz',
  },
  {
    id: 'week_warrior',
    emoji: '🔥',
    label: 'Week Warrior',
    description: '7-day streak achieved',
  },
  {
    id: 'culture_scholar',
    emoji: '🏅',
    label: 'Culture Scholar',
    description: '50 terms in your word bank',
  },
]

export default function BadgeDisplay({ earnedBadges = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {ALL_BADGES.map((badge, i) => {
        const earned = earnedBadges.includes(badge.id)
        return (
          <motion.div
            key={badge.id}
            className={`rounded-xl border p-4 text-center transition-all ${
              earned
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-slate-700/50 bg-[#1E293B] opacity-40'
            }`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: earned ? 1 : 0.4, scale: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="text-3xl mb-2">{badge.emoji}</div>
            <p className={`text-sm font-semibold ${earned ? 'text-white' : 'text-slate-400'}`}>
              {badge.label}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{badge.description}</p>
          </motion.div>
        )
      })}
    </div>
  )
}
