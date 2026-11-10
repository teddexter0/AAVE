import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle } from 'lucide-react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import WordBankPage from './pages/WordBankPage'
import ProfilePage from './pages/ProfilePage'
import Leaderboard from './pages/Leaderboard'
import FriendsPage from './pages/FriendsPage'

export default function App() {
  const { user, userDoc, loading } = useAuth()
  const [showSignInToast, setShowSignInToast] = useState(false)
  const previousUid = useRef(undefined)
  const uid = user?.uid ?? null

  useEffect(() => {
    if (loading) return
    const signedIn = previousUid.current === null && uid !== null
    previousUid.current = uid
    setShowSignInToast(signedIn)
    if (!signedIn) return

    const timer = window.setTimeout(() => setShowSignInToast(false), 3500)
    return () => window.clearTimeout(timer)
  }, [loading, uid])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F172A]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0F172A]">
        <Navbar user={user} />
        {createPortal(
          <div role="status" className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-[60]">
            {showSignInToast && user && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-sm font-medium text-emerald-200 shadow-lg">
                <CheckCircle size={18} aria-hidden="true" />
                Signed in successfully
              </div>
            )}
          </div>,
          document.body,
        )}
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route
            path="/dashboard"
            element={user ? <Dashboard user={user} userDoc={userDoc} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/word-bank"
            element={user ? <WordBankPage user={user} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/profile"
            element={user ? <ProfilePage user={user} userDoc={userDoc} /> : <Navigate to="/" replace />}
          />
          <Route path="/leaderboard" element={<Leaderboard user={user} />} />
          <Route
            path="/friends"
            element={user ? <FriendsPage user={user} userDoc={userDoc} /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
