import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Search, UserPlus, UserMinus, Flame, Zap, BookOpen, Trophy, Star } from 'lucide-react'
import { dbHelpers } from '../services/firebase'
import { getLevelInfo } from '../utils/levels'

const ACTIVITY_ICONS = {
  added:    { icon: BookOpen, label: 'added',    color: 'text-blue-400' },
  mastered: { icon: Trophy,   label: 'mastered', color: 'text-amber-400' },
  reviewed: { icon: Star,     label: 'reviewed', color: 'text-purple-400' },
}

function timeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(isoStr).toLocaleDateString()
}

function FriendCard({ friend, onRemove, isRemoving }) {
  const { current: lvl } = getLevelInfo(friend.xp || 0)
  const activity = friend.recentActivity || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-700/50 bg-[#1E293B] p-4"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
          <span className="font-bold text-amber-400 text-sm">
            {(friend.displayName || '?')[0].toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-white truncate">{friend.displayName || 'Anonymous'}</p>
              <p className="text-xs text-slate-400">
                {friend.username && <span className="text-amber-400/70 font-mono">@{friend.username} · </span>}
                {lvl.title}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-1 text-orange-400 text-sm font-bold">
                <Flame size={13} fill="currentColor" />
                {friend.streak || 0}
              </span>
              <span className="flex items-center gap-1 text-purple-300 text-xs font-medium">
                <Zap size={11} fill="currentColor" />
                {friend.xp || 0}
              </span>
              <button
                onClick={() => onRemove(friend.id)}
                disabled={isRemoving}
                className="rounded-lg border border-slate-600/50 px-2 py-1 text-xs text-slate-400 hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40"
              >
                <UserMinus size={13} />
              </button>
            </div>
          </div>

          {/* Recent activity */}
          {activity.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {activity.slice(0, 4).map((a, i) => {
                const meta = ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.added
                const Icon = meta.icon
                return (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-800/60 px-2 py-0.5 text-xs"
                  >
                    <Icon size={10} className={meta.color} />
                    <span className="text-white capitalize">{a.term}</span>
                    <span className="text-slate-500">{timeAgo(a.at)}</span>
                  </span>
                )
              })}
            </div>
          )}
          {activity.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-600">No activity yet</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function FriendsPage({ user, userDoc }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [friendsDocs, setFriendsDocs] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(true)
  const [removingUid, setRemovingUid] = useState(null)
  const [addingUid, setAddingUid] = useState(null)

  // Load full docs for all friends
  useEffect(() => {
    const friendUids = (userDoc?.friends || []).map((f) => f.uid)
    if (!friendUids.length) { setFriendsDocs([]); setLoadingFriends(false); return }
    dbHelpers.getFriendsDocs(friendUids)
      .then(setFriendsDocs)
      .catch(console.error)
      .finally(() => setLoadingFriends(false))
  }, [JSON.stringify(userDoc?.friends)])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const results = await dbHelpers.searchUsers(searchQuery, user.uid)
      setSearchResults(results)
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  const addFriend = async (friendDoc) => {
    setAddingUid(friendDoc.id)
    try {
      await dbHelpers.addFriend(user.uid, friendDoc.id, friendDoc.displayName, friendDoc.username || null)
    } catch (err) {
      console.error(err)
    } finally {
      setAddingUid(null)
    }
  }

  const removeFriend = async (friendUid) => {
    setRemovingUid(friendUid)
    try {
      await dbHelpers.removeFriend(user.uid, friendUid)
      setFriendsDocs((prev) => prev.filter((f) => f.id !== friendUid))
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingUid(null)
    }
  }

  const friendUids = new Set((userDoc?.friends || []).map((f) => f.uid))

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to add friends.</p>
      </div>
    )
  }

  // Sort friends docs by streak desc for mini-leaderboard order
  const sortedFriends = [...friendsDocs].sort((a, b) => (b.streak || 0) - (a.streak || 0))

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="mb-8 flex items-center gap-3">
          <Users size={26} className="text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Friends</h1>
            <p className="text-slate-400 text-sm">See what your people are learning.</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by @username or name…"
              className="flex-1 rounded-xl border border-slate-700/50 bg-[#1E293B] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500/50"
            />
            <button
              type="submit"
              disabled={searching}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors disabled:opacity-60"
            >
              <Search size={15} />
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>

          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 space-y-2"
              >
                {searchResults.map((u) => {
                  const already = friendUids.has(u.id)
                  const { current: lvl } = getLevelInfo(u.xp || 0)
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-[#1E293B] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                          <span className="text-xs font-bold text-amber-400">
                            {(u.displayName || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{u.displayName || 'Anonymous'}</p>
                          <p className="text-xs text-slate-500">
                            {u.username ? <span className="text-amber-400/70 font-mono">@{u.username} · </span> : ''}
                            {lvl.title} · 🔥 {u.streak || 0}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => !already && addFriend(u)}
                        disabled={already || addingUid === u.id}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          already
                            ? 'border border-slate-700/50 text-slate-500 cursor-default'
                            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                        }`}
                      >
                        <UserPlus size={12} />
                        {already ? 'Friends' : addingUid === u.id ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  )
                })}
                {searchResults.length === 0 && !searching && (
                  <p className="text-sm text-slate-500 py-2">No users found.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Friends list */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Your Friends {friendsDocs.length > 0 && `(${friendsDocs.length})`}
          </h2>

          {loadingFriends ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-slate-700/50 bg-[#1E293B] animate-pulse" />
              ))}
            </div>
          ) : sortedFriends.length === 0 ? (
            <div className="rounded-xl border border-slate-700/40 bg-[#1E293B] px-6 py-10 text-center">
              <Users size={32} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">No friends yet</p>
              <p className="text-slate-500 text-sm mt-1">Search for people above to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedFriends.map((f) => (
                <FriendCard
                  key={f.id}
                  friend={f}
                  onRemove={removeFriend}
                  isRemoving={removingUid === f.id}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </main>
  )
}
