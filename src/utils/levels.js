export const LEVELS = [
  { level: 1,  title: 'Tourist',          minXP: 0    },
  { level: 2,  title: 'Curious',          minXP: 25   },
  { level: 3,  title: 'Slang Savvy',      minXP: 75   },
  { level: 4,  title: 'Hustler',          minXP: 175  },
  { level: 5,  title: 'Translator',       minXP: 350  },
  { level: 6,  title: 'Hood Scholar',     minXP: 600  },
  { level: 7,  title: 'Culture Archivist', minXP: 1000 },
]

/**
 * Returns the user's current level, next level, XP progress %, and raw XP.
 */
export function getLevelInfo(xp = 0) {
  let idx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) { idx = i; break }
  }
  const current = LEVELS[idx]
  const next = LEVELS[idx + 1] || null
  const progress = next
    ? ((xp - current.minXP) / (next.minXP - current.minXP)) * 100
    : 100
  return { current, next, progress: Math.min(progress, 100), xp }
}
