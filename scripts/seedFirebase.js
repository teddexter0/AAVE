/**
 * One-time script to seed the Firestore `terms` collection.
 * Run with: node scripts/seedFirebase.js
 *
 * Requires a service account key or Firebase Admin SDK credentials.
 * Set GOOGLE_APPLICATION_CREDENTIALS or inline the config below.
 *
 * Safe to re-run — checks for existing terms before writing (no duplicates).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ─── Load seed data ───────────────────────────────────────────────────────────
// We import the seed terms as a JSON-compatible object.
// Since this is a Node script we read the file directly.
const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = join(__dirname, '../src/data/seedTerms.js')

// Dynamic import for ESM
const { seedTerms } = await import(seedPath)

// ─── Firebase Admin init ──────────────────────────────────────────────────────
// Option A: Set GOOGLE_APPLICATION_CREDENTIALS env var to your service account JSON path
// Option B: Paste your service account JSON inline as `serviceAccount` below

if (!getApps().length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath) {
    console.error(
      '❌  Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.\n' +
      '   e.g. GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/seedFirebase.js'
    )
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
  initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore()

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n🌱  Seeding ${seedTerms.length} AAVE terms into Firestore…\n`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const termData of seedTerms) {
    const slug = termData.term.toLowerCase().replace(/\s+/g, '_')
    const ref = db.collection('terms').doc(slug)

    try {
      const snap = await ref.get()
      if (snap.exists) {
        console.log(`  ⏭   Skip   "${termData.term}" (already exists)`)
        skipped++
        continue
      }

      await ref.set({
        ...termData,
        addedAt: Timestamp.now(),
        reviewedAt: null,
      })
      console.log(`  ✅  Added  "${termData.term}"`)
      created++
    } catch (err) {
      console.error(`  ❌  Error  "${termData.term}":`, err.message)
      errors++
    }
  }

  console.log(`\n─────────────────────────────`)
  console.log(`  Created : ${created}`)
  console.log(`  Skipped : ${skipped}`)
  console.log(`  Errors  : ${errors}`)
  console.log(`─────────────────────────────\n`)

  // ─── Set Word of the Day ──────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const randomTerm = seedTerms[Math.floor(Math.random() * seedTerms.length)]

  await db.collection('meta').doc('wordOfTheDay').set({
    term: randomTerm.term.toLowerCase().replace(/\s+/g, '_'),
    date: today,
  })

  console.log(`🌟  Word of the Day set to: "${randomTerm.term}" (${today})\n`)
  console.log('✅  Seeding complete!\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Fatal seed error:', err)
  process.exit(1)
})
