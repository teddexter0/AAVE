import { useState, useEffect } from 'react'
import { authHelpers, dbHelpers } from '../services/firebase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = authHelpers.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser)
          const doc = await dbHelpers.getUserDoc(firebaseUser.uid)
          setUserDoc(doc)
        } else {
          setUser(null)
          setUserDoc(null)
        }
      } catch (err) {
        console.error('Auth state error:', err)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const refreshUserDoc = async () => {
    if (!user) return
    const doc = await dbHelpers.getUserDoc(user.uid)
    setUserDoc(doc)
  }

  return { user, userDoc, loading, refreshUserDoc }
}
