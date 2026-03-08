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
    await setDoc(doc(db, 'users', user.uid), {
      displayName: user.displayName || '',
      email: user.email || '',
      streak: 0,
      lastActiveDate: '',
      wordsLookedUp: 0,
      badges: [],
      joinedAt: serverTimestamp(),
    })
  },

  async ensureUserDoc(user) {
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await this.createUserDoc(user)
    }
    return snap.data()
  },

  async getUserDoc(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  async updateUserDoc(uid, data) {
    await updateDoc(doc(db, 'users', uid), data)
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
      // Increment wordsLookedUp counter
      const userRef = doc(db, 'users', uid)
      const userSnap = await getDoc(userRef)
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          wordsLookedUp: (userSnap.data().wordsLookedUp || 0) + 1,
        })
      }
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
