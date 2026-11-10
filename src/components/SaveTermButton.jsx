import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, Check, Loader2 } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import { termSlug, withTimeout } from '../services/lookupCore'
import AuthModal from './AuthModal'

const SAVE_STATES = {
  idle: { label: 'Save to My Words', icon: BookmarkPlus },
  saving: { label: 'Saving…', icon: Loader2 },
  saved: { label: 'Saved to My Words', icon: Check },
  error: { label: 'Retry save', icon: BookmarkPlus },
}

export default function SaveTermButton({ user, termData, autoSave = false }) {
  const [attempt, setAttempt] = useState(autoSave ? 1 : 0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const uid = user?.uid

  useEffect(() => {
    if (!uid || !termData || !attempt) return
    let active = true
    setStatus('saving')
    setError('')
    void withTimeout(
      dbHelpers.addToWordBank(uid, termSlug(termData.term), termData.term, termData),
      12000,
      'Saving took too long. Check your connection and retry.',
    ).then(() => {
      if (active) setStatus('saved')
    }).catch(saveError => {
      if (!active) return
      setStatus('error')
      setError(saveError.code === 'permission-denied'
        ? 'Saving was blocked for this account. Sign in again and retry.'
        : saveError.message || 'Could not save this term. Please retry.')
    })
    return () => { active = false }
  }, [uid, termData, attempt])

  const { label, icon: StatusIcon } = SAVE_STATES[status]

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => uid ? setAttempt(value => value + 1) : setShowAuth(true)}
          disabled={status === 'saving' || status === 'saved'}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-70"
        >
          <StatusIcon size={16} aria-hidden="true" className={status === 'saving' ? 'animate-spin' : ''} />
          {uid ? label : 'Sign in to save'}
        </button>
        {status === 'saved' && <Link to="/word-bank" className="text-sm text-amber-300 underline">Open My Words</Link>}
        <span role="status" className="sr-only">{status === 'saved' ? 'Term saved to My Words.' : status === 'saving' ? 'Saving term.' : ''}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      {showAuth && !uid && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
