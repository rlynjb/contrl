import * as SQLite from 'expo-sqlite';
import { pushChanges } from './sync';
import type {
  User,
  Exercise,
  WorkoutSession,
  ExerciseEntry,
  GateProgress,
  GateStatus,
  WeekProgress,
  DraftSession,
  Category,
} from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('contrl.db');
  await migrate(db);
  await seedExercisesIfEmpty(db);
  return db;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      push_level INTEGER DEFAULT 1,
      pull_level INTEGER DEFAULT 1,
      squat_level INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      notion_page_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      level INTEGER NOT NULL,
      target_sets INTEGER NOT NULL,
      target_reps INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      tempo TEXT,
      notes TEXT,
      notion_page_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      level INTEGER NOT NULL,
      category TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      notes TEXT,
      passed INTEGER,
      created_at TEXT,
      notion_page_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gate_progress (
      id TEXT PRIMARY KEY,
      level INTEGER NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      consecutive_passes INTEGER DEFAULT 0,
      last_session_date TEXT,
      notion_page_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS week_progress (
      week_start TEXT PRIMARY KEY,
      push_done INTEGER DEFAULT 0,
      pull_done INTEGER DEFAULT 0,
      squat_done INTEGER DEFAULT 0,
      notion_page_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      level INTEGER NOT NULL,
      exercises_json TEXT,
      notes TEXT,
      saved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_deletions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      notion_page_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      last_pushed_at TEXT,
      last_pulled_at TEXT
    );

    -- Migrations for existing databases (ALTER TABLE is idempotent with IF NOT EXISTS in newer SQLite)
  `);

  // Add new exercise columns if missing
  const exerciseCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(exercises)"
  );
  const exerciseColNames = new Set(exerciseCols.map(c => c.name));
  if (!exerciseColNames.has('tempo')) await database.execAsync('ALTER TABLE exercises ADD COLUMN tempo TEXT');
  if (!exerciseColNames.has('notes')) await database.execAsync('ALTER TABLE exercises ADD COLUMN notes TEXT');

  // Add new session columns if missing
  const sessionCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(sessions)"
  );
  const sessionColNames = new Set(sessionCols.map(c => c.name));
  if (!sessionColNames.has('passed')) await database.execAsync('ALTER TABLE sessions ADD COLUMN passed INTEGER');
  if (!sessionColNames.has('created_at')) await database.execAsync('ALTER TABLE sessions ADD COLUMN created_at TEXT');

  // week_progress.week_start changed from Sunday-based to Monday-based.
  // Re-key any Sunday-shaped row to the preceding Monday (date - 6 days).
  const weekRows = await database.getAllAsync<{ week_start: string }>(
    'SELECT week_start FROM week_progress'
  );
  for (const { week_start } of weekRows) {
    const [y, m, d] = week_start.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getDay() === 0) {
      date.setDate(date.getDate() - 6);
      const newKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      await database.runAsync(
        'UPDATE week_progress SET week_start = ? WHERE week_start = ?',
        [newKey, week_start]
      );
    }
  }

  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
    CREATE INDEX IF NOT EXISTS idx_exercises_level ON exercises(level);
    CREATE INDEX IF NOT EXISTS idx_exercises_notion ON exercises(notion_page_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category);
    CREATE INDEX IF NOT EXISTS idx_sessions_notion ON sessions(notion_page_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_gate_progress_notion ON gate_progress(notion_page_id);
    CREATE INDEX IF NOT EXISTS idx_week_progress_notion ON week_progress(notion_page_id);
  `);

  // Seed default user if none exists
  const existing = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM user_profile WHERE id = ?',
    ['default']
  );
  if (!existing) {
    const now = new Date().toISOString();
    await database.runAsync(
      'INSERT INTO user_profile (id, push_level, pull_level, squat_level, created_at, updated_at) VALUES (?, 1, 1, 1, ?, ?)',
      ['default', now, now]
    );
  }

  await database.runAsync(
    `INSERT OR IGNORE INTO sync_state (id, last_pushed_at, last_pulled_at) VALUES ('default', NULL, NULL)`
  );
}

async function seedExercisesIfEmpty(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM exercises'
  );
  if (row && row.cnt > 0) return;

  const seedData = require('../data/exercises-seed.json') as {
    id: string; name: string; category: string; level: number;
    targetSets: number; targetReps: number;
    tempo?: string; notes?: string;
  }[];

  const now = new Date().toISOString();
  for (const raw of seedData) {
    await database.runAsync(
      `INSERT OR IGNORE INTO exercises (id, name, category, level, target_sets, target_reps, sort_order, tempo, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [raw.id, raw.name, raw.category, raw.level, raw.targetSets, raw.targetReps, raw.tempo ?? null, raw.notes ?? null, now]
    );
  }
}

// ── User ────────────────────────────────────────────────────

export async function getUser(): Promise<User> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{
    id: string;
    push_level: number;
    pull_level: number;
    squat_level: number;
    created_at: string;
    notion_page_id: string | null;
    updated_at: string;
  }>('SELECT * FROM user_profile WHERE id = ?', ['default']);

  if (!row) throw new Error('No user found');

  return {
    id: row.id,
    levels: { push: row.push_level, pull: row.pull_level, squat: row.squat_level },
    createdAt: row.created_at,
    notionPageId: row.notion_page_id,
    updatedAt: row.updated_at,
  };
}

export async function updateUserLevel(category: Category, level: number): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `UPDATE user_profile SET ${category}_level = ?, updated_at = ? WHERE id = ?`,
    [level, now, 'default']
  );
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

// ── Exercises ───────────────────────────────────────────────

type ExerciseRow = {
  id: string; name: string; category: string; level: number;
  target_sets: number; target_reps: number;
  sort_order: number;
  tempo: string | null; notes: string | null;
  notion_page_id: string | null; updated_at: string;
};

function rowToExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Category,
    level: r.level,
    targetSets: r.target_sets,
    targetReps: r.target_reps,
    isHold: (r.tempo ?? '') === 'Steady',
    sortOrder: r.sort_order,
    tempo: r.tempo ?? undefined,
    notes: r.notes ?? undefined,
    notionPageId: r.notion_page_id,
    updatedAt: r.updated_at,
  };
}

export async function getExercises(): Promise<Exercise[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises ORDER BY category, level, sort_order'
  );
  return rows.map(rowToExercise);
}

export async function getExercisesByCategory(category: Category, level: number): Promise<Exercise[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE category = ? AND level = ? ORDER BY sort_order',
    [category, level]
  );
  return rows.map(rowToExercise);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  await recordTombstone('sessions', sessionId);
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

export async function deleteAllExercises(): Promise<void> {
  const d = await getDatabase();
  const toDelete = await d.getAllAsync<{ id: string }>('SELECT id FROM exercises');
  await d.runAsync('DELETE FROM exercises');
  for (const { id } of toDelete) {
    await recordTombstone('exercises', id);
  }
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

export async function deleteExercisesNotIn(ids: string[]): Promise<void> {
  if (ids.length === 0) return deleteAllExercises();
  const d = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const toDelete = await d.getAllAsync<{ id: string }>(
    `SELECT id FROM exercises WHERE id NOT IN (${placeholders})`, ids
  );
  await d.runAsync(`DELETE FROM exercises WHERE id NOT IN (${placeholders})`, ids);
  for (const { id } of toDelete) {
    await recordTombstone('exercises', id);
  }
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

export async function upsertExercise(exercise: Exercise): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `INSERT OR REPLACE INTO exercises (id, name, category, level, target_sets, target_reps, sort_order, tempo, notes, notion_page_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      exercise.id,
      exercise.name,
      exercise.category,
      exercise.level,
      exercise.targetSets,
      exercise.targetReps,
      exercise.sortOrder ?? 0,
      exercise.tempo ?? null,
      exercise.notes ?? null,
      exercise.notionPageId ?? null,
      exercise.updatedAt ?? now,
    ]
  );
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

// ── Sessions ────────────────────────────────────────────────

export async function insertSession(session: WorkoutSession): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `INSERT INTO sessions (id, date, level, category, exercises_json, notes, passed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.date,
      session.level,
      session.category,
      JSON.stringify(session.exercises),
      session.notes ?? null,
      session.passed != null ? (session.passed ? 1 : 0) : null,
      now,
    ]
  );
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

export async function getSessions(): Promise<WorkoutSession[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string; date: string; level: number; category: string;
    exercises_json: string; notes: string | null;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM sessions ORDER BY date DESC');

  return rows.map(rowToSession);
}

export async function getSessionsByCategory(category: Category): Promise<WorkoutSession[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string; date: string; level: number; category: string;
    exercises_json: string; notes: string | null;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM sessions WHERE category = ? ORDER BY date DESC', [category]);

  return rows.map(rowToSession);
}

function rowToSession(row: {
  id: string; date: string; level: number; category: string;
  exercises_json: string; notes: string | null;
  passed: number | null;
  notion_page_id: string | null; updated_at: string;
}): WorkoutSession {
  return {
    id: row.id,
    date: row.date,
    level: row.level,
    category: row.category as Category,
    exercises: JSON.parse(row.exercises_json) as ExerciseEntry[],
    notes: row.notes ?? undefined,
    passed: row.passed != null ? row.passed === 1 : undefined,
    notionPageId: row.notion_page_id,
    updatedAt: row.updated_at,
  };
}

// ── Gate Progress ───────────────────────────────────────────

export async function getGateProgress(category: Category, level: number): Promise<GateProgress | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{
    id: string; level: number; category: string; status: string;
    consecutive_passes: number; last_session_date: string | null;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM gate_progress WHERE id = ?', [`${category}:${level}`]);

  if (!row) return null;

  return {
    level: row.level,
    category: row.category as Category,
    status: row.status as GateStatus,
    consecutivePasses: row.consecutive_passes,
    lastSessionDate: row.last_session_date ?? undefined,
    notionPageId: row.notion_page_id,
    updatedAt: row.updated_at,
  };
}

export async function getAllGateProgress(): Promise<Record<string, GateProgress>> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string; level: number; category: string; status: string;
    consecutive_passes: number; last_session_date: string | null;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM gate_progress');

  const result: Record<string, GateProgress> = {};
  for (const row of rows) {
    result[`${row.category}:${row.level}`] = {
      level: row.level,
      category: row.category as Category,
      status: row.status as GateStatus,
      consecutivePasses: row.consecutive_passes,
      lastSessionDate: row.last_session_date ?? undefined,
      notionPageId: row.notion_page_id,
      updatedAt: row.updated_at,
    };
  }
  return result;
}

export async function updateGateProgress(gp: GateProgress): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  const id = `${gp.category}:${gp.level}`;
  await d.runAsync(
    `INSERT OR REPLACE INTO gate_progress (id, level, category, status, consecutive_passes, last_session_date, notion_page_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, gp.level, gp.category, gp.status, gp.consecutivePasses, gp.lastSessionDate ?? null, gp.notionPageId ?? null, now]
  );
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

// ── Week Progress ───────────────────────────────────────────

export async function getWeekProgress(weekStart: string): Promise<WeekProgress | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{
    week_start: string; push_done: number; pull_done: number; squat_done: number;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM week_progress WHERE week_start = ?', [weekStart]);

  if (!row) return null;

  return {
    weekStart: row.week_start,
    sessionsCompleted: {
      push: row.push_done === 1,
      pull: row.pull_done === 1,
      squat: row.squat_done === 1,
    },
    notionPageId: row.notion_page_id,
    updatedAt: row.updated_at,
  };
}

export async function getAllWeekProgress(): Promise<Record<string, WeekProgress>> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    week_start: string; push_done: number; pull_done: number; squat_done: number;
    notion_page_id: string | null; updated_at: string;
  }>('SELECT * FROM week_progress ORDER BY week_start DESC');

  const result: Record<string, WeekProgress> = {};
  for (const row of rows) {
    result[row.week_start] = {
      weekStart: row.week_start,
      sessionsCompleted: {
        push: row.push_done === 1,
        pull: row.pull_done === 1,
        squat: row.squat_done === 1,
      },
      notionPageId: row.notion_page_id,
      updatedAt: row.updated_at,
    };
  }
  return result;
}

export async function updateWeekProgress(wp: WeekProgress): Promise<void> {
  const d = await getDatabase();
  const now = new Date().toISOString();
  await d.runAsync(
    `INSERT OR REPLACE INTO week_progress (week_start, push_done, pull_done, squat_done, notion_page_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      wp.weekStart,
      wp.sessionsCompleted.push ? 1 : 0,
      wp.sessionsCompleted.pull ? 1 : 0,
      wp.sessionsCompleted.squat ? 1 : 0,
      wp.notionPageId ?? null,
      now,
    ]
  );
  pushChanges().catch(() => {});  // fire-and-forget; suppressed if sync not configured
}

// ── Drafts ──────────────────────────────────────────────────

export async function saveDraft(category: Category, level: number, draft: DraftSession): Promise<void> {
  const d = await getDatabase();
  const id = `draft:${category}:${level}`;
  await d.runAsync(
    `INSERT OR REPLACE INTO drafts (id, category, level, exercises_json, notes, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, category, level, JSON.stringify(draft.exercises), draft.notes, draft.savedAt]
  );
}

export async function getDraft(category: Category, level: number): Promise<DraftSession | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{
    id: string; category: string; level: number;
    exercises_json: string | null; notes: string | null; saved_at: string;
  }>('SELECT * FROM drafts WHERE id = ?', [`draft:${category}:${level}`]);

  if (!row) return null;

  return {
    category: row.category as Category,
    level: row.level,
    exercises: row.exercises_json ? JSON.parse(row.exercises_json) : [],
    notes: row.notes ?? '',
    savedAt: row.saved_at,
  };
}

export async function deleteDraft(category: Category, level: number): Promise<void> {
  const d = await getDatabase();
  await d.runAsync('DELETE FROM drafts WHERE id = ?', [`draft:${category}:${level}`]);
}

// ── Sync state ──────────────────────────────────────────────

export async function getSyncState(): Promise<{ lastPushedAt: string | null; lastPulledAt: string | null }> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{ last_pushed_at: string | null; last_pulled_at: string | null }>(
    `SELECT last_pushed_at, last_pulled_at FROM sync_state WHERE id = 'default'`
  );
  return {
    lastPushedAt: row?.last_pushed_at ?? null,
    lastPulledAt: row?.last_pulled_at ?? null,
  };
}

export async function setLastPushedAt(at: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(`UPDATE sync_state SET last_pushed_at = ? WHERE id = 'default'`, [at]);
}

export async function setLastPulledAt(at: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(`UPDATE sync_state SET last_pulled_at = ? WHERE id = 'default'`, [at]);
}

// ── Tombstones (re-using sync_deletions for Supabase deletes) ──

export async function recordTombstone(entityType: string, entityId: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `INSERT INTO sync_deletions (entity_type, entity_id, notion_page_id, deleted_at)
     VALUES (?, ?, NULL, ?)`,
    [entityType, entityId, new Date().toISOString()]
  );
}

export async function getPendingTombstones(): Promise<{ id: number; entityType: string; entityId: string }[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{ id: number; entity_type: string; entity_id: string }>(
    'SELECT id, entity_type, entity_id FROM sync_deletions'
  );
  return rows.map(r => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id }));
}

export async function clearTombstones(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`DELETE FROM sync_deletions WHERE id IN (${placeholders})`, ids);
}
