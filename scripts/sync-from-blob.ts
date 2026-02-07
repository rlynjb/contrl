#!/usr/bin/env npx ts-node

/**
 * Sync Mock Data from Netlify Blob
 *
 * Fetches data from Netlify Blob storage and writes to src/mocks/data/* files.
 * This allows you to pull production/staging data into your local mock environment.
 *
 * USAGE
 * -----
 * # From local Netlify dev server
 * npx ts-node scripts/sync-from-blob.ts
 *
 * # From production
 * npx ts-node scripts/sync-from-blob.ts --url https://your-site.netlify.app
 *
 * # With custom base URL
 * BLOB_API_URL=http://localhost:8888 npx ts-node scripts/sync-from-blob.ts
 *
 * WHAT GETS SYNCED
 * ----------------
 * - User data (levels, weekly progress) -> updates MOCK_CurrentUserLevel, MOCK_weeklyWorkouts
 * - Exercise levels -> updates workoutLevels
 *
 * NOTE: This modifies files in src/mocks/data/. Commit changes if you want to keep them.
 */

import * as fs from 'fs'
import * as path from 'path'

const DEFAULT_BASE_URL = 'http://localhost:8888'

interface UserData {
  currentLevels: { Push: number; Pull: number; Squat: number }
  weeklyProgress?: Array<{
    exercises: Array<{
      name: string
      sets: Array<{ reps?: number; duration?: number }>
      tempo?: string
      rest?: number
      equipment?: string
    }>
    categories: string[]
    level: number
    date: string | Date
  }>
  lastUpdated: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function generateUserDataFile(userData: UserData): string {
  const currentLevels = JSON.stringify(userData.currentLevels, null, 2)
    .replace(/"(\w+)":/g, '$1:') // Remove quotes from keys

  const weeklyWorkouts = userData.weeklyProgress?.map(session => {
    const exercises = session.exercises.map(ex => {
      const parts = [`      name: "${ex.name}"`]
      parts.push(`      sets: ${JSON.stringify(ex.sets)}`)
      if (ex.tempo) parts.push(`      tempo: "${ex.tempo}"`)
      if (ex.rest) parts.push(`      rest: ${ex.rest}`)
      if (ex.equipment) parts.push(`      equipment: "${ex.equipment}"`)
      return `    {\n${parts.join(',\n')}\n    }`
    }).join(',\n')

    return `  {
    exercises: [
${exercises}
    ],
    categories: ${JSON.stringify(session.categories)},
    level: ${session.level},
    date: new Date("${new Date(session.date).toISOString()}")
  }`
  }).join(',\n') || ''

  return `/**
 * User Mock Data
 *
 * Auto-generated from Netlify Blob storage.
 * Generated: ${new Date().toISOString()}
 */

import type { CurrentUserLevels, WorkoutSession, UserData } from '@/api/user'

// User's current progress levels (synced from Blob)
export const MOCK_CurrentUserLevel: CurrentUserLevels = ${currentLevels}

// Weekly workout sessions (synced from Blob)
export const MOCK_weeklyWorkouts: WorkoutSession[] = [
${weeklyWorkouts}
]

// Today's planned workout - combines all categories
export const todaysTodayWorkout: WorkoutSession = {
  exercises: [],
  categories: ['Push', 'Pull', 'Squat'],
  level: Math.max(MOCK_CurrentUserLevel.Push, MOCK_CurrentUserLevel.Pull, MOCK_CurrentUserLevel.Squat),
  date: new Date()
}

// Complete mock user data
export const MOCK_UserData: UserData = {
  currentLevels: MOCK_CurrentUserLevel,
  weeklyProgress: MOCK_weeklyWorkouts,
  lastUpdated: "${userData.lastUpdated}"
}
`
}

async function main() {
  // Parse command line args
  const args = process.argv.slice(2)
  let baseUrl = process.env.BLOB_API_URL || DEFAULT_BASE_URL

  const urlArgIndex = args.indexOf('--url')
  if (urlArgIndex !== -1 && args[urlArgIndex + 1]) {
    baseUrl = args[urlArgIndex + 1]
  }

  console.log(`\n📡 Syncing from: ${baseUrl}\n`)

  try {
    // Fetch user data
    console.log('  Fetching user data...')
    const userData = await fetchJson<UserData>(`${baseUrl}/user/data`)
    console.log(`  ✓ User levels: Push=${userData.currentLevels.Push}, Pull=${userData.currentLevels.Pull}, Squat=${userData.currentLevels.Squat}`)
    console.log(`  ✓ Weekly workouts: ${userData.weeklyProgress?.length || 0} sessions`)

    // Generate and write user.ts
    const userFilePath = path.join(__dirname, '../src/mocks/data/user.ts')
    const userFileContent = generateUserDataFile(userData)
    fs.writeFileSync(userFilePath, userFileContent, 'utf-8')
    console.log(`\n  📝 Written: src/mocks/data/user.ts`)

    console.log('\n✅ Sync complete!')
    console.log('\nNext steps:')
    console.log('  1. Review changes: git diff src/mocks/data/')
    console.log('  2. Restart dev server to pick up changes')
    console.log('  3. Commit if you want to keep: git add src/mocks/data/ && git commit -m "sync mock data from blob"')

  } catch (error) {
    console.error('\n❌ Sync failed:', error instanceof Error ? error.message : error)
    console.error('\nTroubleshooting:')
    console.error('  - Is netlify dev running? (for local sync)')
    console.error('  - Is the URL correct? (for production sync)')
    console.error('  - Has the blob been seeded? Run: curl -X POST ' + baseUrl + '/seed')
    process.exit(1)
  }
}

main()
