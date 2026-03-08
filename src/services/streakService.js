import { dbHelpers } from './firebase'

const BADGE_THRESHOLDS = {
  week_warrior: 7,
}

export const streakService = {
  /**
   * Returns the user's current streak count.
   */
  async getStreak(uid) {
    const userDoc = await dbHelpers.getUserDoc(uid)
    if (!userDoc) return 0
    return userDoc.streak || 0
  },

  /**
   * Records user activity for today.
   * Increments streak if this is the first activity today.
   * Resets streak if more than 24 hours have passed since lastActiveDate.
   * Returns the updated streak count.
   */
  async recordActivity(uid) {
    const userDoc = await dbHelpers.getUserDoc(uid)
    if (!userDoc) return 0

    const today = new Date().toISOString().slice(0, 10)
    const lastActive = userDoc.lastActiveDate || ''

    if (lastActive === today) {
      // Already active today — streak unchanged
      return userDoc.streak || 0
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const newStreak = lastActive === yesterday ? (userDoc.streak || 0) + 1 : 1

    await dbHelpers.updateUserDoc(uid, {
      streak: newStreak,
      lastActiveDate: today,
    })

    // Award week warrior badge
    if (newStreak >= BADGE_THRESHOLDS.week_warrior) {
      await dbHelpers.awardBadge(uid, 'week_warrior')
    }

    return newStreak
  },
}
