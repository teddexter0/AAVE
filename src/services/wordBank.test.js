import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { termSlug } from './lookupCore.js'

async function loadDatabase() {
  const documents = new Map()
  const versions = new Map()
  const auth = { currentUser: { uid: 'user', displayName: 'Test Learner', email: 'test@example.invalid' } }
  let failCommit = false
  const snapshot = path => {
    const data = documents.get(path)
    return { exists: () => data !== undefined, data: () => structuredClone(data) }
  }
  const checkDefined = value => {
    assert.notEqual(value, undefined, 'Firestore rejects undefined fields')
    if (value && typeof value === 'object') Object.values(value).forEach(checkDefined)
  }
  const api = {
    initializeApp: () => ({}),
    getFirestore: () => ({}),
    getAuth: () => auth,
    doc: (_, ...parts) => parts.join('/'),
    termSlug,
    serverTimestamp: () => ({ seconds: 100 }),
    Timestamp: { fromDate: date => ({ seconds: Math.floor(date.getTime() / 1000) }) },
    async runTransaction(_, callback) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map()
        const writes = []
        const transaction = {
          async get(path) {
            reads.set(path, versions.get(path) || 0)
            return snapshot(path)
          },
          set(path, data, options) { writes.push({ path, data, merge: options?.merge }) },
          update(path, data) { writes.push({ path, data, merge: true }) },
        }
        const result = await callback(transaction)
        if ([...reads].some(([path, version]) => (versions.get(path) || 0) !== version)) continue
        if (failCommit) throw new Error('Connection unavailable')
        writes.forEach(({ data }) => checkDefined(data))
        for (const { path, data, merge } of writes) {
          documents.set(path, structuredClone(merge ? { ...documents.get(path), ...data } : data))
          versions.set(path, (versions.get(path) || 0) + 1)
        }
        return result
      }
      throw new Error('Too many transaction conflicts')
    },
  }
  let source = await readFile(new URL('./firebase.js', import.meta.url), 'utf8')
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replace(/import\.meta\.env\.\w+/g, "'test'")
    .replace(/export \{[\s\S]*?\}\s*$/, '')
    .replace(/export /g, '')
  // Unused SDK bindings remain undefined and must not be touched by private saves.
  const sdkNames = ['getDoc', 'setDoc', 'addDoc', 'updateDoc', 'collection', 'query', 'where', 'getDocs', 'orderBy', 'limit', 'increment', 'onSnapshot', 'onAuthStateChanged', 'signInWithEmailAndPassword', 'createUserWithEmailAndPassword', 'signInWithPopup', 'GoogleAuthProvider', 'signOut', 'updateProfile', 'sendPasswordResetEmail']
  sdkNames.forEach(name => { api[name] = () => assert.fail('Unexpected SDK dependency: ' + name) })
  const dbHelpers = new Function(...Object.keys(api), source + '\nreturn dbHelpers')(...Object.values(api))
  return { dbHelpers, documents, auth, failNextSave: () => { failCommit = true } }
}

const term = { term: "I'm tapped in", definition: 'Connected and informed.', category: 'slang expression' }

test('a new private save includes its definition and works before profile initialization', async () => {
  const { dbHelpers, documents } = await loadDatabase()
  const id = termSlug(term.term)
  const result = await dbHelpers.addToWordBank('user', id, term.term, term)
  assert.equal(result.created, true)
  assert.equal(documents.get('users/user/wordBank/' + id).termData.definition, term.definition)
  assert.equal(documents.get('users/user').wordsLookedUp, 1)
  assert.equal(documents.get('users/user').xp, 2)
  assert.deepEqual(documents.get('users/user').badges, ['first_look'])
  assert.ok([...documents.keys()].every(path => path.startsWith('users/user')))
})

test('concurrent saves and late profile creation cannot duplicate rewards or reset progress', async () => {
  const { dbHelpers, documents, auth } = await loadDatabase()
  const id = termSlug(term.term)
  await Promise.all([
    dbHelpers.addToWordBank('user', id, term.term, term),
    dbHelpers.addToWordBank('user', id, term.term, term),
    dbHelpers.createUserDoc(auth.currentUser),
  ])
  const path = 'users/user/wordBank/' + id
  documents.get(path).masteryLevel = 3
  documents.get(path).quizAttempts = 7
  await dbHelpers.addToWordBank('user', id, term.term, term)
  assert.equal(documents.get('users/user').wordsLookedUp, 1)
  assert.equal(documents.get('users/user').xp, 2)
  assert.equal(documents.get(path).masteryLevel, 3)
  assert.equal(documents.get(path).quizAttempts, 7)
})

test('a rejected save is atomic and another account cannot write to this bank', async () => {
  const { dbHelpers, documents, failNextSave } = await loadDatabase()
  await assert.rejects(dbHelpers.addToWordBank('another-user', 'term', term.term, term), /Sign in/)
  failNextSave()
  await assert.rejects(dbHelpers.addToWordBank('user', 'term', term.term, term), /Connection unavailable/)
  assert.equal(documents.size, 0)
})

test('quizzes can mix new private snapshots with old shared-dictionary entries', async () => {
  const wordBank = [
    { id: 'one', termData: { term: 'one', definition: 'First meaning' } },
    { id: 'two', termData: { term: 'two', definition: 'Second meaning' } },
    { id: 'legacy' },
    { id: 'four', termData: { term: 'four', definition: 'Fourth meaning' } },
  ]
  const reads = []
  const dbHelpers = {
    getWordBank: async () => wordBank,
    getTermBySlug: async id => { reads.push(id); return { id, term: id, definition: 'Legacy meaning' } },
  }
  const source = (await readFile(new URL('./quizService.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/export /g, '')
  const generateQuiz = new Function('dbHelpers', 'Timestamp', source + '\nreturn generateQuiz')(dbHelpers, {})
  const questions = await generateQuiz('user')
  assert.equal(questions.length, 3)
  assert.deepEqual(reads, ['legacy'])
  assert.equal(questions[0].correctAnswer, 'First meaning')
})

test('initializing a legacy profile alongside a save cannot reset the saved-word count', async () => {
  const { dbHelpers, documents, auth } = await loadDatabase()
  documents.set('users/user', { displayName: 'Legacy name' })
  await Promise.all([
    dbHelpers.ensureUserDoc(auth.currentUser),
    dbHelpers.addToWordBank('user', termSlug(term.term), term.term, term),
  ])
  assert.equal(documents.get('users/user').displayName, 'Legacy name')
  assert.equal(documents.get('users/user').wordsLookedUp, 1)
  assert.equal(documents.get('users/user').xp, 2)
})
