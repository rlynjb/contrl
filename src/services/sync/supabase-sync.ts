import * as db from '@/services/database';
import { supabase } from './client';
import { isSyncConfigured, USER_ID } from './config';
import {
  sessionToRemote,
  exerciseToRemote,
  gateToRemote,
  weekToRemote,
  userToRemote,
} from './mapper';

function logErr(label: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
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
