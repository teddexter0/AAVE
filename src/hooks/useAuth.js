import { useState, useEffect } from 'react'
import { onSnapshot, doc } from 'firebase/firestore'
import { authHelpers, dbHelpers, db } from '../services/firebase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubDoc = null

    const unsubAuth = authHelpers.onAuthStateChanged(async (firebaseUser) => {
      // Clean up previous doc subscription
      if (unsubDoc) { unsubDoc(); unsubDoc = null }

      if (firebaseUser) {
        setUser(firebaseUser)
        // Ensure user doc exists (handles new Google sign-in etc.)
        try { await dbHelpers.ensureUserDoc(firebaseUser) } catch {}
        // Real-time listener — keeps streak/wordsLookedUp/badges always fresh
        unsubDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            setUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null)
            setLoading(false)
          },
          (err) => {
            console.error('User doc subscription error:', err)
            setLoading(false)
          }
        )
      } else {
        setUser(null)
        setUserDoc(null)
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      if (unsubDoc) unsubDoc()
    }
  }, [])

  return { user, userDoc, loading }
}
