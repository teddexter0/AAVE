import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Brain, ChevronRight, Trophy, Loader2 } from 'lucide-react'
import { generateQuiz, recordQuizResult, saveQuizSession } from '../services/quizService'
import { streakService } from '../services/streakService'
import { dbHelpers } from '../services/firebase'

export default function QuizMode({ user, onFinish }) {
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answers, setAnswers] = useState([])
  const [phase, setPhase] = useState('loading') // loading | quiz | result
  const [score, setScore] = useState(0)

  useEffect(() => {
    loadQuiz()
  }, [])

  const loadQuiz = async () => {
    try {
      const qs = await generateQuiz(user.uid)
      if (qs.length === 0) {
        setPhase('no_terms')
        return
      }
      setQuestions(qs)
      setPhase('quiz')
    } catch (err) {
      console.error('Quiz load error:', err)
      setPhase('error')
    }
  }

  const handleAnswer = async (option) => {
    if (selected !== null) return
    setSelected(option)

    const q = questions[current]
    const correct = option === q.correctAnswer
    const newAnswers = [...answers, { termId: q.termId, correct }]
    setAnswers(newAnswers)

    if (correct) setScore((s) => s + 1)

    // Update mastery level
    await recordQuizResult(user.uid, q.termId, correct, q.masteryLevel)

    // Auto-advance after 1.2s
    setTimeout(async () => {
      if (current + 1 >= questions.length) {
        // Quiz complete
        const finalScore = newAnswers.filter((a) => a.correct).length
        await saveQuizSession(
          user.uid,
          questions.map((q) => q.term),
          finalScore,
          questions.length
        )
        await streakService.recordActivity(user.uid)

        // Award quiz starter badge
        await dbHelpers.awardBadge(user.uid, 'quiz_starter')

        setPhase('result')
      } else {
        setCurrent((c) => c + 1)
        setSelected(null)
      }
    }, 1200)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
        <Loader2 size={28} className="animate-spin text-amber-500" />
        <p>Generating your quiz…</p>
      </div>
    )
  }

  if (phase === 'no_terms') {
    return (
      <div className="py-12 text-center">
        <Brain size={40} className="mx-auto mb-3 text-slate-600" />
        <p className="text-white font-medium">Not enough terms yet</p>
        <p className="text-sm text-slate-400 mt-1">
          Look up at least 5 terms to unlock quiz mode.
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="py-12 text-center">
        <p className="text-red-400">Couldn't load the quiz. Please try again.</p>
      </div>
    )
  }

  if (phase === 'result') {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <motion.div
        className="py-8 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Trophy size={52} className="mx-auto mb-4 text-amber-400" />
        <h3 className="text-2xl font-bold text-white mb-1">Quiz complete!</h3>
        <p className="text-5xl font-black text-amber-400 my-4">{pct}%</p>
        <p className="text-slate-400 mb-2">
          {score} / {questions.length} correct
        </p>
        <p className="text-sm text-slate-500 mb-8">
          {pct === 100
            ? "Perfect score! You're killing it 🔥"
            : pct >= 66
            ? 'Solid work! Keep it up.'
            : 'Keep studying — you got this!'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setCurrent(0)
              setSelected(null)
              setAnswers([])
              setScore(0)
              setPhase('loading')
              loadQuiz()
            }}
            className="rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            Quiz again
          </button>
          <button
            onClick={onFinish}
            className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm text-slate-300 hover:text-white transition-colors"
          >
            Back to word bank
          </button>
        </div>
      </motion.div>
    )
  }

  const q = questions[current]

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>Question {current + 1} of {questions.length}</span>
          <span>{score} correct</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${((current) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-xl font-bold text-white mb-6">{q.question}</p>

          <div className="space-y-3">
            {q.options.map((option) => {
              let state = 'default'
              if (selected !== null) {
                if (option === q.correctAnswer) state = 'correct'
                else if (option === selected) state = 'wrong'
              }

              const styles = {
                default: 'border-slate-600 bg-[#1E293B] text-white hover:border-amber-500/50 hover:bg-[#243348]',
                correct: 'border-green-500 bg-green-500/10 text-green-300',
                wrong: 'border-red-500 bg-red-500/10 text-red-300',
              }

              return (
                <button
                  key={option}
                  onClick={() => handleAnswer(option)}
                  disabled={selected !== null}
                  className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all flex items-center justify-between gap-3 ${styles[state]}`}
                >
                  <span className="leading-snug">{option}</span>
                  {state === 'correct' && <CheckCircle size={18} className="shrink-0 text-green-400" />}
                  {state === 'wrong' && <XCircle size={18} className="shrink-0 text-red-400" />}
                  {state === 'default' && selected === null && <ChevronRight size={16} className="shrink-0 text-slate-500" />}
                </button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
