import { useState, useEffect, useCallback } from 'react'
import { dbHelpers } from '../services/firebase'

export function useWordBank(user) {
  const [wordBank, setWordBank] = useState([])
  const [loading, setLoading] = useState(false)

  const loadWordBank = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const words = await dbHelpers.getWordBank(user.uid)
    setWordBank(words)
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadWordBank()
  }, [loadWordBank])

  return { wordBank, loading, reload: loadWordBank }
}
