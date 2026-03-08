import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import WordBankPage from './pages/WordBankPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  const { user, userDoc, loading } = useAuth()

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
