import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, X } from 'lucide-react'
import WordBank from '../components/WordBank'
import QuizMode from '../components/QuizMode'
import { useWordBank } from '../hooks/useWordBank'

export default function WordBankPage({ user }) {
  const { wordBank, loading, reload } = useWordBank(user)
  const [showQuiz, setShowQuiz] = useState(false)

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your word bank.</p>
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="mb-6 flex items-center gap-3">
          <BookOpen size={24} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">My Word Bank</h1>
        </div>

        <AnimatePresence mode="wait">
          {showQuiz ? (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border border-slate-700/50 bg-[#1E293B] p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Quiz Mode</h2>
                <button
                  onClick={() => setShowQuiz(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <QuizMode
                user={user}
                onFinish={() => {
                  setShowQuiz(false)
                  reload()
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="bank"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <WordBank
                words={wordBank}
                loading={loading}
                onQuizMe={() => setShowQuiz(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
