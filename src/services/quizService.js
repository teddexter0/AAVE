import { dbHelpers } from './firebase'
import { Timestamp } from 'firebase/firestore'

const MASTERY_INTERVALS_DAYS = [0, 1, 3, 7] // days until next review per mastery level

/**
 * Generates a 3-question multiple-choice quiz from the user's word bank.
 * Prioritises terms that haven't been seen recently (spaced repetition).
 *
 * @param {string} uid
 * @returns {Array<{ question, correctAnswer, options, termId }>}
 */
export async function generateQuiz(uid) {
  const wordBank = await dbHelpers.getWordBank(uid)

  if (wordBank.length < 3) return []

  // Sort: items due for review first (nextReviewAt <= now), then by lookedUpAt
  const now = new Date()
  const sorted = [...wordBank].sort((a, b) => {
    const aReview = a.nextReviewAt?.toDate?.() || new Date(0)
    const bReview = b.nextReviewAt?.toDate?.() || new Date(0)
    const aDue = aReview <= now
    const bDue = bReview <= now
    if (aDue && !bDue) return -1
    if (!aDue && bDue) return 1
    return aReview - bReview
  })

  const quizTerms = sorted.slice(0, 3)

  // Fetch full term data for each quiz term
  const termDataList = await Promise.all(
    quizTerms.map((entry) => dbHelpers.getTermBySlug(entry.id))
  )

  // Build distractor pool from the rest of the word bank
  const distractorSlugs = sorted
    .slice(3)
    .map((e) => e.id)
    .slice(0, 9)

  const distractorData = await Promise.all(
    distractorSlugs.map((slug) => dbHelpers.getTermBySlug(slug))
  )
  const distractors = distractorData.filter(Boolean)

  const questions = []

  for (let i = 0; i < quizTerms.length; i++) {
    const correct = termDataList[i]
    const wordBankEntry = quizTerms[i]
    if (!correct) continue

    // Pick 3 distractors (wrong answers)
    const wrongPool = distractors
      .filter((d) => d.id !== correct.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)

    // If not enough distractors, fill with placeholder options
    while (wrongPool.length < 3) {
      wrongPool.push({
        definition: `Not the right meaning for "${correct.term}"`,
        term: `distractor_${wrongPool.length}`,
      })
    }

    const options = [correct.definition, ...wrongPool.map((d) => d.definition)]
      .sort(() => Math.random() - 0.5)

    questions.push({
      termId: wordBankEntry.id,
      term: correct.term,
      question: `What does "${correct.term}" mean?`,
      correctAnswer: correct.definition,
      options,
      masteryLevel: wordBankEntry.masteryLevel || 0,
    })
  }

  return questions
}

/**
 * Updates mastery level and next review date after a quiz answer.
 */
export async function recordQuizResult(uid, termId, wasCorrect, currentMastery) {
  const newMastery = wasCorrect
    ? Math.min(currentMastery + 1, 3)
    : Math.max(currentMastery - 1, 0)

  const daysUntilReview = MASTERY_INTERVALS_DAYS[newMastery] || 0
  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + daysUntilReview)

  await dbHelpers.updateWordBankEntry(uid, termId, {
    masteryLevel: newMastery,
    nextReviewAt: Timestamp.fromDate(nextReview),
    quizAttempts: (await dbHelpers.getWordBank(uid)).find((w) => w.id === termId)
      ?.quizAttempts + 1 || 1,
  })

  return newMastery
}

/**
 * Saves a completed quiz session.
 */
export async function saveQuizSession(uid, terms, score, totalQuestions) {
  await dbHelpers.saveQuizSession(uid, { terms, score, totalQuestions })
}
