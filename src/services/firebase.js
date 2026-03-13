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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
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

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    const cred = await signInWithPopup(auth, provider)
    await dbHelpers.ensureUserDoc(cred.user)
    return cred.user
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
      streak: 0,
      lastActiveDate: '',
      wordsLookedUp: 0,
      xp: 0,
      badges: [],
      friends: [],      // array of { uid, displayName }
      recentActivity: [], // array of { type, term, at } — last 5, public
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
    // Patch older docs missing new fields
    const data = snap.data()
    const patches = {}
    if (data.displayNameLower === undefined) patches.displayNameLower = (data.displayName || '').toLowerCase()
    if (data.friends === undefined) patches.friends = []
    if (data.recentActivity === undefined) patches.recentActivity = []
    if (data.xp === undefined) patches.xp = 0
    if (Object.keys(patches).length) await updateDoc(ref, patches)
    return { ...data, ...patches }
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

  /** Prefix search by displayNameLower — returns up to 6 results, excludes self */
  async searchUsers(queryStr, selfUid) {
    const q = queryStr.toLowerCase().trim()
    if (!q) return []
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('displayNameLower', '>=', q),
        where('displayNameLower', '<=', q + '\uf8ff'),
        limit(6)
      )
    )
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.id !== selfUid)
  },

  async addFriend(uid, friendUid, friendDisplayName) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const friends = snap.data().friends || []
    if (friends.some((f) => f.uid === friendUid)) return // already added
    await updateDoc(ref, { friends: [...friends, { uid: friendUid, displayName: friendDisplayName }] })
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
