import { dbHelpers } from './firebase'

const BADGE_THRESHOLDS = {
  week_warrior: 7,
}

/** Returns YYYY-MM-DD in the user's LOCAL timezone — not UTC */
function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Yesterday in local timezone — DST-safe (setDate handles clock changes correctly) */
function localYesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateStr(d)
}

export const streakService = {
  async getStreak(uid) {
    const userDoc = await dbHelpers.getUserDoc(uid)
    if (!userDoc) return 0
    return userDoc.streak || 0
  },

  /**
   * Records user activity for today.
   * Uses LOCAL timezone so e.g. 11 PM in UTC-5 counts as "today" for that user,
   * not "tomorrow" as it would if we used .toISOString() (UTC).
   */
  async recordActivity(uid) {
    const userDoc = await dbHelpers.getUserDoc(uid)
    if (!userDoc) return 0

    const today = localDateStr()
    const lastActive = userDoc.lastActiveDate || ''

    if (lastActive === today) {
      return userDoc.streak || 0
    }

    const yesterday = localYesterdayStr()
    const newStreak = lastActive === yesterday ? (userDoc.streak || 0) + 1 : 1

    await dbHelpers.updateUserDoc(uid, {
      streak: newStreak,
      lastActiveDate: today,
    })

    if (newStreak >= BADGE_THRESHOLDS.week_warrior) {
      await dbHelpers.awardBadge(uid, 'week_warrior')
    }

    return newStreak
  },
}
