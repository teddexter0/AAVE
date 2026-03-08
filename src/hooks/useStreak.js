import { useState, useEffect } from 'react'
import { streakService } from '../services/streakService'

export function useStreak(user) {
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (!user) return
    streakService.getStreak(user.uid).then(setStreak)
  }, [user])

  const recordActivity = async () => {
    if (!user) return
    const newStreak = await streakService.recordActivity(user.uid)
    setStreak(newStreak)
    return newStreak
  }

  return { streak, recordActivity }
}
