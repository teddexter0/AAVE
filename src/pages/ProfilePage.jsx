import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User, Mail, Calendar, BookOpen, Flame, Trophy, AtSign, Check, X, Loader2, Pencil } from 'lucide-react'
import BadgeDisplay from '../components/BadgeDisplay'
import StreakBadge from '../components/StreakBadge'
import { dbHelpers } from '../services/firebase'

// ── Username section ──────────────────────────────────────────────────────────

function UsernameSection({ user, userDoc }) {
  const [editing, setEditing]     = useState(false)
  const [input, setInput]         = useState('')
  const [status, setStatus]       = useState('idle') // idle|checking|available|taken|invalid|saving|saved|error|quota
  const [statusMsg, setStatusMsg] = useState('')

  // Compute quota state from userDoc
  const changedAt = userDoc?.usernameChangedAt
  const hasExistingUsername = !!userDoc?.username
  let quotaActive = false
  let quotaNextDate = ''
  let quotaDaysLeft = 0
  if (hasExistingUsername && changedAt) {
    const msElapsed = Date.now() - (changedAt.toMillis?.() ?? new Date(changedAt).getTime())
    quotaDaysLeft = Math.ceil((30 * 86400000 - msElapsed) / 86400000)
    if (quotaDaysLeft > 0) {
      quotaActive = true
      quotaNextDate = new Date((changedAt.toMillis?.() ?? new Date(changedAt).getTime()) + 30 * 86400000)
        .toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  // Debounce availability check as user types
  useEffect(() => {
    if (!editing) return
    const raw = input.trim()
    if (!raw) { setStatus('idle'); setStatusMsg(''); return }

    const formatErr = dbHelpers.validateUsername(raw)
    if (formatErr) { setStatus('invalid'); setStatusMsg(formatErr); return }

    setStatus('checking')
    setStatusMsg('')
    const timer = setTimeout(async () => {
      try {
        const available = await dbHelpers.checkUsernameAvailability(raw, user.uid)
        setStatus(available ? 'available' : 'taken')
        setStatusMsg(available ? '' : 'That username is already taken.')
      } catch { setStatus('idle') }
    }, 450)
    return () => clearTimeout(timer)
  }, [input, editing])

  const startEdit = () => {
    setInput(userDoc?.username || '')
    setStatus('idle')
    setStatusMsg('')
    setEditing(true)
  }

  const cancel = () => setEditing(false)

  const save = async () => {
    const raw = input.trim()
    const formatErr = dbHelpers.validateUsername(raw)
    if (formatErr) { setStatus('invalid'); setStatusMsg(formatErr); return }
    if (status === 'taken') return

    setStatus('saving')
    try {
      await dbHelpers.setUsername(user.uid, raw)
      setStatus('saved')
      setEditing(false)
    } catch (err) {
      if (err.code === 'taken')  { setStatus('taken');  setStatusMsg('That username is already taken.') }
      else if (err.code === 'quota') { setStatus('quota'); setStatusMsg(err.message) }
      else { setStatus('error'); setStatusMsg('Something went wrong. Try again.') }
    }
  }

  const currentUsername = userDoc?.username

  const statusColor = {
    available: 'text-emerald-400',
    taken:     'text-red-400',
    invalid:   'text-amber-400',
    checking:  'text-slate-400',
    error:     'text-red-400',
    quota:     'text-amber-400',
  }[status] || ''

  const canSave = status === 'available' && input.trim() !== currentUsername

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-[#1E293B] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AtSign size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Username</h2>
        </div>
        {!editing && (
          <button
            onClick={quotaActive ? undefined : startEdit}
            disabled={quotaActive}
            title={quotaActive ? `Next change available ${quotaNextDate}` : undefined}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs transition-colors ${
              quotaActive
                ? 'border-slate-700/40 text-slate-600 cursor-not-allowed'
                : 'border-slate-600/50 text-slate-400 hover:text-white hover:border-amber-500/30'
            }`}
          >
            <Pencil size={11} />
            {currentUsername ? 'Change' : 'Set username'}
          </button>
        )}
      </div>

      {!editing ? (
        currentUsername ? (
          <div>
            <p className="text-xl font-bold text-amber-400">@{currentUsername}</p>
            <p className="text-xs text-slate-500 mt-1">Friends can search for you with this handle.</p>
            {quotaActive && (
              <p className="text-xs text-amber-600/80 mt-1">
                Next change available {quotaNextDate} ({quotaDaysLeft}d remaining)
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-400">No username set yet.</p>
            <p className="text-xs text-slate-500 mt-0.5">Set one so friends can find you easily.</p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono font-bold text-lg">@</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="your_handle"
              maxLength={20}
              autoFocus
              className="flex-1 rounded-xl border border-slate-600 bg-[#0F172A] px-3 py-2 text-white font-mono placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={save}
              disabled={!canSave || status === 'saving'}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-40"
            >
              {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save
            </button>
            <button onClick={cancel} className="rounded-xl border border-slate-600/50 px-3 py-2">
              <X size={13} className="text-slate-400" />
            </button>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 min-h-[16px]">
            {status === 'checking' && <Loader2 size={12} className="animate-spin text-slate-400" />}
            {status === 'available' && <Check size={12} className="text-emerald-400" />}
            {(status === 'taken' || status === 'invalid' || status === 'error' || status === 'quota') && <X size={12} className="text-red-400" />}
            {(statusMsg || status === 'available') && (
              <span className={`text-xs ${statusColor}`}>
                {status === 'available' ? 'Available!' : statusMsg}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500">
            3–20 characters · letters, numbers, underscores only · case-insensitive · globally unique
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfilePage({ user, userDoc }) {
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your profile.</p>
      </div>
    )
  }

  const joinedAt = userDoc?.joinedAt?.toDate?.()

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Avatar + info */}
        <div className="rounded-2xl border border-slate-700/50 bg-[#1E293B] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 shrink-0">
              <span className="text-2xl font-bold text-amber-400">
                {(userDoc?.displayName || user.displayName || user.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">
                {userDoc?.displayName || user.displayName || 'Anonymous'}
              </h1>
              {userDoc?.username && (
                <p className="text-amber-400 font-mono text-sm">@{userDoc.username}</p>
              )}
              <div className="flex items-center gap-1.5 text-slate-400 text-sm mt-1">
                <Mail size={13} />
                <span className="truncate">{user.email}</span>
              </div>
              {joinedAt && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                  <Calendar size={12} />
                  <span>Joined {joinedAt.toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Username */}
        <UsernameSection user={user} userDoc={userDoc} />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <Flame size={20} className="mx-auto mb-1 text-orange-400" />
            <p className="text-2xl font-black text-white">{userDoc?.streak || 0}</p>
            <p className="text-xs text-slate-400">Day streak</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <BookOpen size={20} className="mx-auto mb-1 text-blue-400" />
            <p className="text-2xl font-black text-white">{userDoc?.wordsLookedUp || 0}</p>
            <p className="text-xs text-slate-400">Terms in bank</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4 text-center">
            <Trophy size={20} className="mx-auto mb-1 text-amber-400" />
            <p className="text-2xl font-black text-white">{(userDoc?.badges || []).length}</p>
            <p className="text-xs text-slate-400">Badges</p>
          </div>
        </div>

        {/* Current streak */}
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 flex items-center justify-between">
          <p className="text-sm text-orange-300">Current streak</p>
          <StreakBadge streak={userDoc?.streak || 0} size="sm" />
        </div>

        {/* Badges */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Badges</h2>
          <BadgeDisplay earnedBadges={userDoc?.badges || []} />
        </div>
      </motion.div>
    </main>
  )
}
