import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export const authHelpers = {
  onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),

  async signUp(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    await dbHelpers.createUserDoc(cred.user)
    return cred.user
  },

  async signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return cred.user
  },

  async sendPasswordReset(email) {
    await sendPasswordResetEmail(auth, email)
  },

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    // signInWithRedirect avoids Cross-Origin-Opener-Policy errors that popup
    // triggers on Vercel (and any host with COOP: same-origin). Firebase
    // processes the return automatically; onAuthStateChanged fires on landing.
    await signInWithRedirect(auth, provider)
  },

  async signOut() {
    await signOut(auth)
  },
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export const dbHelpers = {
  // User document
  async createUserDoc(user) {
    const displayName = user.displayName || ''
    await setDoc(doc(db, 'users', user.uid), {
      displayName,
      displayNameLower: displayName.toLowerCase(),
      email: user.email || '',
      username: null,             // set separately via setUsername()
      usernameChangedAt: null,    // tracks 30-day change quota
      streak: 0,
      lastActiveDate: '',
      wordsLookedUp: 0,
      xp: 0,
      badges: [],
      friends: [],
      recentActivity: [],
      joinedAt: serverTimestamp(),
    })
  },

  async ensureUserDoc(user) {
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await this.createUserDoc(user)
      const fresh = await getDoc(ref)
      return fresh.data()
    }
    const data = snap.data()
    const patches = {}
    if (data.displayNameLower === undefined) patches.displayNameLower = (data.displayName || '').toLowerCase()
    if (data.friends === undefined) patches.friends = []
    if (data.recentActivity === undefined) patches.recentActivity = []
    if (data.xp === undefined) patches.xp = 0
    if (data.username === undefined) patches.username = null
    if (data.usernameChangedAt === undefined) patches.usernameChangedAt = null
    if (Object.keys(patches).length) await updateDoc(ref, patches)
    return { ...data, ...patches }
  },

  // ─── Username ────────────────────────────────────────────────────────────

  /**
   * Validate username format.
   * Rules (industry standard — same as GitHub/Instagram):
   *  • 3–20 characters
   *  • Lowercase letters, digits, underscores only (no spaces, no @)
   *  • Cannot start or end with underscore
   *  • Cannot be all digits
   */
  validateUsername(raw) {
    const u = raw.trim().toLowerCase()
    if (u.length < 3 || u.length > 20) return 'Must be 3–20 characters.'
    if (!/^[a-z0-9_]+$/.test(u))       return 'Only letters, numbers, and underscores.'
    if (u.startsWith('_') || u.endsWith('_')) return 'Cannot start or end with an underscore.'
    if (/^[0-9]+$/.test(u))            return 'Must contain at least one letter.'
    return null // valid
  },

  /** Returns true if the username is already taken by someone else */
  async checkUsernameAvailability(raw, selfUid) {
    const u = raw.trim().toLowerCase()
    const snap = await getDoc(doc(db, 'usernames', u))
    if (!snap.exists()) return true           // free
    return snap.data().uid === selfUid        // already mine → still "available"
  },

  /**
   * Claim a new username atomically.
   * - Validates format
   * - Checks uniqueness inside a Firestore transaction
   * - Releases old username if the user is changing it
   * Throws with { code: 'taken' | 'invalid', message } on failure.
   */
  async setUsername(uid, raw) {
    const u = raw.trim().toLowerCase()
    const err = this.validateUsername(u)
    if (err) throw Object.assign(new Error(err), { code: 'invalid' })

    const userRef      = doc(db, 'users', uid)
    const newHandleRef = doc(db, 'usernames', u)

    await runTransaction(db, async (tx) => {
      const userSnap   = await tx.get(userRef)
      const handleSnap = await tx.get(newHandleRef)

      if (!userSnap.exists()) throw new Error('User not found')

      const userData = userSnap.data()

      // Someone else owns this handle
      if (handleSnap.exists() && handleSnap.data().uid !== uid) {
        throw Object.assign(new Error('That username is already taken.'), { code: 'taken' })
      }

      // 30-day change quota — only applies when *changing* an existing username
      const oldHandle = userData.username
      if (oldHandle && oldHandle !== u) {
        const changedAt = userData.usernameChangedAt
        if (changedAt) {
          const msElapsed = Date.now() - changedAt.toMillis()
          const daysLeft  = Math.ceil((30 * 86400000 - msElapsed) / 86400000)
          if (daysLeft > 0) {
            const nextDate = new Date(changedAt.toMillis() + 30 * 86400000)
              .toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
            throw Object.assign(
              new Error(`You can change your username again on ${nextDate}.`),
              { code: 'quota', daysLeft, nextDate }
            )
          }
        }
        // Release old handle
        tx.delete(doc(db, 'usernames', oldHandle))
      }

      // Claim new handle
      tx.set(newHandleRef, { uid, claimedAt: serverTimestamp() })
      tx.update(userRef, { username: u, usernameChangedAt: serverTimestamp() })
    })
  },

  async getUserDoc(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  async updateUserDoc(uid, data) {
    await updateDoc(doc(db, 'users', uid), data)
  },

  // XP — uses atomic increment to avoid race conditions
  async addXP(uid, amount) {
    await updateDoc(doc(db, 'users', uid), { xp: increment(amount) })
  },

  // Terms
  async getTermBySlug(slug) {
    const snap = await getDoc(doc(db, 'terms', slug))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  async saveTerm(termData) {
    const slug = termData.term.toLowerCase().replace(/\s+/g, '_')
    await setDoc(doc(db, 'terms', slug), {
      ...termData,
      addedAt: serverTimestamp(),
      reviewedAt: null,
    })
    return slug
  },

  // Word bank
  async addToWordBank(uid, termId, term) {
    const ref = doc(db, 'users', uid, 'wordBank', termId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        term,
        lookedUpAt: serverTimestamp(),
        masteryLevel: 0,
        nextReviewAt: Timestamp.fromDate(new Date()),
        quizAttempts: 0,
      })
      await updateDoc(doc(db, 'users', uid), { wordsLookedUp: increment(1) })
    }
  },

  async getWordBank(uid) {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'wordBank'),
        orderBy('lookedUpAt', 'desc')
      )
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  },

  async getWordBankEntry(uid, termId) {
    const snap = await getDoc(doc(db, 'users', uid, 'wordBank', termId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  async updateWordBankEntry(uid, termId, data) {
    await updateDoc(doc(db, 'users', uid, 'wordBank', termId), data)
  },

  // Quiz sessions
  async saveQuizSession(uid, session) {
    await addDoc(collection(db, 'users', uid, 'quizSessions'), {
      ...session,
      sessionDate: serverTimestamp(),
    })
  },

  // Word of the day
  async getWordOfTheDay() {
    const snap = await getDoc(doc(db, 'meta', 'wordOfTheDay'))
    if (!snap.exists()) return null
    const { term, date } = snap.data()
    const today = new Date().toISOString().slice(0, 10)
    if (date !== today) return null
    return this.getTermBySlug(term.toLowerCase().replace(/\s+/g, '_'))
  },

  // Badges
  async awardBadge(uid, badgeId) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const badges = snap.data().badges || []
    if (!badges.includes(badgeId)) {
      await updateDoc(ref, { badges: [...badges, badgeId] })
    }
  },

  // Leaderboard — top 10 by streak (Firestore auto-indexes single fields)
  async getLeaderboard() {
    const snap = await getDocs(
      query(collection(db, 'users'), orderBy('streak', 'desc'), limit(10))
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  },

  // ─── Friends ────────────────────────────────────────────────────────────────

  /**
   * Search users by username (exact) or display name (prefix).
   * Username search runs first — @handles are the primary friend-discovery method.
   */
  async searchUsers(queryStr, selfUid) {
    const q = queryStr.replace(/^@/, '').toLowerCase().trim()
    if (!q) return []

    // Parallel: exact username match + display name prefix
    const [usernameSnap, nameSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('username', '==', q), limit(5))),
      getDocs(query(
        collection(db, 'users'),
        where('displayNameLower', '>=', q),
        where('displayNameLower', '<=', q + '\uf8ff'),
        limit(5)
      )),
    ])

    const seen = new Set()
    const results = []
    for (const d of [...usernameSnap.docs, ...nameSnap.docs]) {
      if (d.id !== selfUid && !seen.has(d.id)) {
        seen.add(d.id)
        results.push({ id: d.id, ...d.data() })
      }
    }
    return results.slice(0, 6)
  },

  async addFriend(uid, friendUid, friendDisplayName, friendUsername = null) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const friends = snap.data().friends || []
    if (friends.some((f) => f.uid === friendUid)) return
    await updateDoc(ref, {
      friends: [...friends, { uid: friendUid, displayName: friendDisplayName, username: friendUsername }],
    })
  },

  async removeFriend(uid, friendUid) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const friends = (snap.data().friends || []).filter((f) => f.uid !== friendUid)
    await updateDoc(ref, { friends })
  },

  /** Fetch full user docs for a list of friend UIDs */
  async getFriendsDocs(friendUids) {
    if (!friendUids.length) return []
    const results = await Promise.all(friendUids.map((uid) => this.getUserDoc(uid)))
    return results.filter(Boolean)
  },

  /**
   * Record an activity event publicly on the user doc (last 5 kept).
   * type: 'added' | 'mastered' | 'reviewed'
   */
  async updateRecentActivity(uid, type, term) {
    if (!term) return
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const current = snap.data().recentActivity || []
    const entry = { type, term, at: new Date().toISOString() }
    // Deduplicate same term+type then prepend, keep 5
    const updated = [entry, ...current.filter((a) => !(a.term === term && a.type === type))].slice(0, 5)
    await updateDoc(ref, { recentActivity: updated })
  },
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp,
}
