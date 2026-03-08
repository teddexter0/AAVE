import { motion } from 'framer-motion'
import SearchBar from '../components/SearchBar'
import WordOfTheDay from '../components/WordOfTheDay'

export default function Home({ user }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {/* Hero */}
      <motion.div
        className="mb-10 text-center"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-tight">
          Understand the{' '}
          <span className="text-amber-400">culture</span>,<br />
          not just the words.
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-md mx-auto">
          An AI-powered AAVE dictionary with culturally accurate definitions,
          usage examples, and origins.
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        className="mb-12"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SearchBar user={user} />
      </motion.div>

      {/* Word of the Day */}
      <WordOfTheDay />
    </main>
  )
}
