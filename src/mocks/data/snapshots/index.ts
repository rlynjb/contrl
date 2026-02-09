/**
 * Snapshot Data Exports
 *
 * These files contain static snapshots of data exported from Netlify Blob.
 * Use these for seeding with consistent, previously-saved data.
 *
 * To update snapshots:
 * 1. curl http://localhost:8888/export > export.json
 * 2. cat export.json | jq '.data.userData' > src/mocks/data/snapshots/user-snapshot.json
 * 3. cat export.json | jq '.data.workoutLevels' > src/mocks/data/snapshots/exercises-snapshot.json
 *
 * To seed from snapshots:
 *   curl -X POST http://localhost:8888/seed?source=snapshot
 */

export { default as userSnapshot } from './user-snapshot.json'
export { default as exercisesSnapshot } from './exercises-snapshot.json'
