import type {
  WorkoutSession,
  Exercise,
  GateProgress,
  WeekProgress,
  User,
  ExerciseEntry,
} from '@/types';
import { USER_ID } from './config';

// ── Sessions ────────────────────────────────────────────────

export function sessionToRemote(s: WorkoutSession) {
  return {
    user_id: USER_ID,
    id: s.id,
    date: s.date,
    level: s.level,
    category: s.category,
    exercises_json: s.exercises,
    notes: s.notes ?? null,
    passed: s.passed ?? null,
    updated_at: s.updatedAt ?? new Date().toISOString(),
  };
}

export function sessionFromRemote(r: any): WorkoutSession {
  return {
    id: r.id,
    date: r.date,
    level: r.level,
    category: r.category,
    exercises: r.exercises_json as ExerciseEntry[],
    notes: r.notes ?? undefined,
    passed: r.passed ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── Exercises ───────────────────────────────────────────────

export function exerciseToRemote(e: Exercise) {
  return {
    user_id: USER_ID,
    id: e.id,
    name: e.name,
    category: e.category,
    level: e.level,
    target_sets: e.targetSets,
    target_reps: e.targetReps,
    sort_order: e.sortOrder ?? 0,
    tempo: e.tempo ?? null,
    notes: e.notes ?? null,
    updated_at: e.updatedAt ?? new Date().toISOString(),
  };
}

export function exerciseFromRemote(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    level: r.level,
    targetSets: r.target_sets,
    targetReps: r.target_reps,
    isHold: ((r.tempo ?? '') === 'Steady'),
    sortOrder: r.sort_order ?? 0,
    tempo: r.tempo ?? undefined,
    notes: r.notes ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── Gate progress ───────────────────────────────────────────

export function gateToRemote(g: GateProgress) {
  return {
    user_id: USER_ID,
    id: `${g.category}:${g.level}`,
    level: g.level,
    category: g.category,
    status: g.status,
    consecutive_passes: g.consecutivePasses,
    last_session_date: g.lastSessionDate ?? null,
    updated_at: g.updatedAt ?? new Date().toISOString(),
  };
}

export function gateFromRemote(r: any): GateProgress {
  return {
    level: r.level,
    category: r.category,
    status: r.status,
    consecutivePasses: r.consecutive_passes,
    lastSessionDate: r.last_session_date ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── Week progress ───────────────────────────────────────────

export function weekToRemote(w: WeekProgress) {
  return {
    user_id: USER_ID,
    week_start: w.weekStart,
    push_done: !!w.sessionsCompleted.push,
    pull_done: !!w.sessionsCompleted.pull,
    squat_done: !!w.sessionsCompleted.squat,
    updated_at: w.updatedAt ?? new Date().toISOString(),
  };
}

export function weekFromRemote(r: any): WeekProgress {
  return {
    weekStart: r.week_start,
    sessionsCompleted: {
      push: !!r.push_done,
      pull: !!r.pull_done,
      squat: !!r.squat_done,
    },
    updatedAt: r.updated_at ?? undefined,
    notionPageId: null,
  };
}

// ── User profile ────────────────────────────────────────────

export function userToRemote(u: User) {
  return {
    user_id: USER_ID,
    push_level: u.levels.push,
    pull_level: u.levels.pull,
    squat_level: u.levels.squat,
    created_at: u.createdAt,
    updated_at: u.updatedAt ?? new Date().toISOString(),
  };
}

export function userFromRemote(r: any): User {
  return {
    id: 'default',
    levels: {
      push: r.push_level,
      pull: r.pull_level,
      squat: r.squat_level,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    notionPageId: null,
  };
}
