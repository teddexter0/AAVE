import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, LayoutDashboard, User, LogOut, Menu, X } from 'lucide-react'
import { authHelpers } from '../services/firebase'
import AuthModal from './AuthModal'

export default function Navbar({ user }) {
  const [showAuth, setShowAuth] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const navLinks = [
    { to: '/', label: 'Search', icon: BookOpen },
    ...(user ? [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/word-bank', label: 'My Words', icon: BookOpen },
      { to: '/profile', label: 'Profile', icon: User },
    ] : []),
  ]

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-slate-700/50 bg-[#0F172A]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-white">
            <span className="text-2xl">🗣️</span>
            <span className="text-amber-400">AAVE</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(to)
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
          </div>

          {/* Auth button */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <button
                onClick={() => authHelpers.signOut()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <LogOut size={15} />
                Sign out
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
              >
                Sign in
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-slate-700/50 px-4 pb-4">
            <div className="flex flex-col gap-1 pt-3">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
              {user ? (
                <button
                  onClick={() => { authHelpers.signOut(); setMenuOpen(false) }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:text-white text-left"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => { setShowAuth(true); setMenuOpen(false) }}
                  className="mt-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
                >
                  Sign in / Sign up
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
