// Preserve any daily fact already cached by an older release.
export async function generateWordFact(term) {
  const slug = term.toLowerCase().replace(/\s+/g, '_')
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const today = `${year}-${month}-${day}`

  try {
    const cached = JSON.parse(localStorage.getItem(`aave_fact_${slug}`) || 'null')
    if (cached?.date === today && typeof cached.fact === 'string') return cached.fact
  } catch {
    // Storage can be blocked or contain an older invalid entry.
  }
  return null
}
