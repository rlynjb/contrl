import * as db from '@/services/database';
import { supabase } from './client';
import { isSyncConfigured, USER_ID } from './config';
import {
  sessionToRemote,
  exerciseToRemote,
  gateToRemote,
  weekToRemote,
  userToRemote,
  sessionFromRemote,
  exerciseFromRemote,
  gateFromRemote,
  weekFromRemote,
  userFromRemote,
} from './mapper';

function logErr(label: string, e: unknown) {
  let msg: string;
  if (e instanceof Error) {
    msg = e.message;
  } else if (e && typeof e === 'object') {
    msg = JSON.stringify(e);
  } else {
    msg = String(e);
  }
  console.warn(`[sync] ${label}:`, msg);
}

// Set to true while pullRestoreIfFresh is running, so the
// fire-and-forget pushChanges() calls triggered by the restore's
// db.insert/update writes early-return instead of thrashing the network.
let restoreInProgress = false;

export async function pushChanges(): Promise<void> {
  if (!isSyncConfigured()) return;
  if (restoreInProgress) return;

  const { lastPushedAt } = await db.getSyncState();
  const since = lastPushedAt;

  // 1. user_profile
  const user = await db.getUser();
  if (!since || (user.updatedAt && user.updatedAt > since)) {
    const { error } = await supabase
      .from('user_profile')
      .upsert(userToRemote(user), { onConflict: 'user_id' });
    if (error) { logErr('push user_profile', error); return; }
  }

  // 2. exercises
  const exercises = await db.getExercises();
  const dirtyExercises = since
    ? exercises.filter(e => e.updatedAt && e.updatedAt > since)
    : exercises;
  if (dirtyExercises.length) {
    const { error } = await supabase
      .from('exercises')
      .upsert(dirtyExercises.map(exerciseToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push exercises', error); return; }
  }

  // 3. sessions
  const sessions = await db.getSessions();
  const dirtySessions = since
    ? sessions.filter(s => s.updatedAt && s.updatedAt > since)
    : sessions;
  if (dirtySessions.length) {
    const { error } = await supabase
      .from('sessions')
      .upsert(dirtySessions.map(sessionToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push sessions', error); return; }
  }

  // 4. gate_progress
  const gates = await db.getAllGateProgress();
  const gateList = Object.values(gates);
  const dirtyGates = since
    ? gateList.filter(g => g.updatedAt && g.updatedAt > since)
    : gateList;
  if (dirtyGates.length) {
    const { error } = await supabase
      .from('gate_progress')
      .upsert(dirtyGates.map(gateToRemote), { onConflict: 'user_id,id' });
    if (error) { logErr('push gate_progress', error); return; }
  }

  // 5. week_progress
  const weeks = await db.getAllWeekProgress();
  const weekList = Object.values(weeks);
  const dirtyWeeks = since
    ? weekList.filter(w => w.updatedAt && w.updatedAt > since)
    : weekList;
  if (dirtyWeeks.length) {
    const { error } = await supabase
      .from('week_progress')
      .upsert(dirtyWeeks.map(weekToRemote), { onConflict: 'user_id,week_start' });
    if (error) { logErr('push week_progress', error); return; }
  }

  // 6. Tombstones
  const tombstones = await db.getPendingTombstones();
  for (const t of tombstones) {
    if (t.entityType === 'week_progress') {
      const { error } = await supabase
        .from('week_progress')
        .delete()
        .match({ user_id: USER_ID, week_start: t.entityId });
      if (error) { logErr('push delete week_progress', error); return; }
    } else {
      const { error } = await supabase
        .from(t.entityType)
        .delete()
        .match({ user_id: USER_ID, id: t.entityId });
      if (error) { logErr(`push delete ${t.entityType}`, error); return; }
    }
  }
  if (tombstones.length) {
    await db.clearTombstones(tombstones.map(t => t.id));
  }

  // 7. Advance watermark
  await db.setLastPushedAt(new Date().toISOString());
}

export async function pullRestoreIfFresh(): Promise<void> {
  if (!isSyncConfigured()) return;

  const { lastPulledAt } = await db.getSyncState();
  if (lastPulledAt) return; // already restored once

  const sessions = await db.getSessions();
  if (sessions.length > 0) return; // not fresh

  // RLS scopes by the JWT user_id claim; no client-side filter needed.
  const [users, exercises, sessionRows, gates, weeks] = await Promise.all([
    supabase.from('user_profile').select('*'),
    supabase.from('exercises').select('*'),
    supabase.from('sessions').select('*'),
    supabase.from('gate_progress').select('*'),
    supabase.from('week_progress').select('*'),
  ]);

  const anyError = [users, exercises, sessionRows, gates, weeks].find(r => r.error);
  if (anyError?.error) {
    logErr('pull', anyError.error);
    return;
  }

  // Suppress the fire-and-forget pushChanges() that each db.* writer
  // triggers — we don't want N concurrent pushes during restore.
  restoreInProgress = true;
  try {
    // Cloud is authoritative on restore: wipe local synced tables first so
    // any stale rows (e.g. from the offline JSON seed) don't survive.
    await db.clearLocalForRestore();

    for (const r of exercises.data ?? []) {
      await db.upsertExercise(exerciseFromRemote(r));
    }

    if (users.data?.[0]) {
      const u = userFromRemote(users.data[0]);
      for (const cat of ['push', 'pull', 'squat'] as const) {
        await db.updateUserLevel(cat, u.levels[cat]);
      }
    }

    for (const r of sessionRows.data ?? []) {
      await db.insertSession(sessionFromRemote(r));
    }

    for (const r of gates.data ?? []) {
      await db.updateGateProgress(gateFromRemote(r));
    }

    for (const r of weeks.data ?? []) {
      await db.updateWeekProgress(weekFromRemote(r));
    }
  } finally {
    restoreInProgress = false;
  }

  // Mark restored AND set the push watermark so we don't immediately
  // re-push everything we just pulled.
  const now = new Date().toISOString();
  await db.setLastPulledAt(now);
  await db.setLastPushedAt(now);
}
