import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Star, Loader2 } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import TermCard from './TermCard'

export default function WordOfTheDay() {
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbHelpers.getWordOfTheDay()
      .then(setTerm)
      .catch(() => setTerm(null))
      .finally(() => setLoading(false))
  }, [])

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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Star size={16} className="text-amber-400" fill="#F59E0B" />
        <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
          Word of the Day
        </span>
      </div>
      <TermCard termData={term} source="db" />
    </motion.div>
  )
}
