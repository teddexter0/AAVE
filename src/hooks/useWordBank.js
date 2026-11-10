import { useState, useEffect, useCallback } from 'react'
import { dbHelpers } from '../services/firebase'

export function useWordBank(user) {
  const uid = user?.uid || null
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ uid: null, words: [], loading: false, error: '' })
  const reload = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (!uid) {
      setState({ uid: null, words: [], loading: false, error: '' })
      return
    }
    let active = true
    setState({ uid, words: [], loading: true, error: '' })
    const unsubscribe = dbHelpers.subscribeWordBank(uid, words => {
      if (active) setState({ uid, words, loading: false, error: '' })
    }, () => {
      if (active) setState({ uid, words: [], loading: false, error: 'Could not load My Words. Check your connection and retry.' })
    })
    return () => { active = false; unsubscribe() }
  }, [uid, attempt])

  const current = state.uid === uid
  return {
    wordBank: current ? state.words : [],
    loading: Boolean(uid) && (!current || state.loading),
    error: current ? state.error : '',
    reload,
  }
}
