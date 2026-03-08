import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

export default function StreakBadge({ streak = 0, size = 'md' }) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-5 py-3 text-lg gap-2.5',
  }

  return (
    <motion.div
      className={`inline-flex items-center rounded-xl bg-orange-500/15 border border-orange-500/20 text-orange-400 font-semibold ${sizeClasses[size]}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
    >
      <Flame size={size === 'lg' ? 22 : size === 'sm' ? 14 : 18} fill="#FB923C" />
      <span>{streak}</span>
      <span className="text-orange-300/70 font-normal">
        {size !== 'sm' && (streak === 1 ? 'day streak' : 'day streak')}
      </span>
    </motion.div>
  )
}
