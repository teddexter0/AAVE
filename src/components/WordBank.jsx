import { motion } from 'framer-motion'
import { BookOpen, Clock, Brain } from 'lucide-react'

const MASTERY_LABELS = ['New', 'Seen', 'Quizzed', 'Mastered']
const MASTERY_COLORS = [
  'bg-slate-500/20 text-slate-400',
  'bg-blue-500/20 text-blue-400',
  'bg-amber-500/20 text-amber-400',
  'bg-green-500/20 text-green-400',
]

export default function WordBank({ words, onQuizMe, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-500 border-t-transparent" />
        <span>Loading your word bank…</span>
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="py-12 text-center">
        <BookOpen size={40} className="mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400 font-medium">Your word bank is empty</p>
        <p className="text-sm text-slate-500 mt-1">
          Search for AAVE terms and they'll appear here automatically.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {words.length} term{words.length !== 1 ? 's' : ''} collected
        </p>
        {words.length >= 5 ? (
          <button
            onClick={onQuizMe}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            <Brain size={16} />
            Quiz Me
          </button>
        ) : (
          <p className="text-xs text-slate-500">
            Look up {5 - words.length} more to unlock Quiz Me
          </p>
        )}
      </div>

      <div className="space-y-2">
        {words.map((entry, i) => (
          <motion.div
            key={entry.id}
            className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-[#1E293B] px-4 py-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <BookOpen size={16} className="shrink-0 text-amber-500" />
              <span className="font-medium text-white truncate capitalize">{entry.term}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className={`hidden sm:inline rounded-full px-2.5 py-0.5 text-xs font-medium ${MASTERY_COLORS[entry.masteryLevel || 0]}`}>
                {MASTERY_LABELS[entry.masteryLevel || 0]}
              </span>
              {entry.lookedUpAt?.toDate && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={11} />
                  {formatDate(entry.lookedUpAt.toDate())}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function formatDate(date) {
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
