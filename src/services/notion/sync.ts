import type { SyncResult } from '../../types/notion';
import type { WorkoutSession } from '../../types';
import {
  getNotionToken,
  getSessionsDbId,
  getExercisesDbId,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from './config';
import { queryDatabase, createPage, updatePage, archivePage } from './api';
import {
  sessionToNotionProperties,
  notionPageToSession,
  notionPageToExercise,
} from './mapper';
import {
  getUnsyncedSessions,
  setSessionNotionPageId,
  upsertSessionFromNotion,
  upsertExercise,
  deleteExercisesNotIn,
  deleteSession,
  getExercises,
  getPendingDeletions,
  clearDeletions,
  getSessions,
} from '../database';

/**
 * Main sync orchestrator — bidirectional sync with Notion.
 * Follows loopd's pull-then-push pattern.
 */
export async function syncAll(): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, errors: [], debug: [] };

  const token = await getNotionToken();
  const sessionsDbId = await getSessionsDbId();
  if (!token || !sessionsDbId) {
    result.errors.push('Notion not configured');
    return result;
  }

  const lastSync = await getLastSyncTimestamp();

  try {
    // Step 1: Pull exercises from Notion (if exercises DB configured)
    const exercisesDbId = await getExercisesDbId();
    if (exercisesDbId) {
      const exercisesPulled = await pullExercises(token, exercisesDbId, result);
      result.debug.push(`Pulled ${exercisesPulled} exercises`);
    }

    // Step 2: Pull sessions from Notion
    const sessionsPulled = await pullSessions(token, sessionsDbId, lastSync, result);
    result.pulled += sessionsPulled;

    // Step 3: Push local sessions to Notion
    const sessionsPushed = await pushSessions(token, sessionsDbId, lastSync, result);
    result.pushed += sessionsPushed;

    // Step 4: Process deletions
    await processDeletions(token, lastSync, result);

    // Step 5: Update last sync timestamp
    await setLastSyncTimestamp(new Date().toISOString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Sync failed: ${msg}`);
    console.error('[contrl] Sync error:', err);
  }

  return result;
}

// ── Pull Exercises ──────────────────────────────────────────

async function pullExercises(
  token: string,
  dbId: string,
  result: SyncResult,
): Promise<number> {
  let count = 0;
  try {
    const pages = await queryDatabase(token, dbId);
    // Upsert all exercises from Notion, then remove stale local ones
    const notionIds: string[] = [];
    for (const page of pages) {
      if (page.archived) continue;
      const exercise = notionPageToExercise(page);
      await upsertExercise(exercise);
      notionIds.push(exercise.id);
      count++;
    }
    await deleteExercisesNotIn(notionIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Pull exercises failed: ${msg}`);
  }
  return count;
}

// ── Pull Sessions ───────────────────────────────────────────

async function pullSessions(
  token: string,
  dbId: string,
  lastSync: string | null,
  result: SyncResult,
): Promise<number> {
  let count = 0;
  try {
    // Build filter for recently edited pages
    let filter: Record<string, unknown> | undefined;
    if (lastSync) {
      filter = {
        timestamp: 'last_edited_time',
        last_edited_time: { after: lastSync },
      };
    }

    // Query ALL pages (no filter) to detect deletions
    const allPages = await queryDatabase(token, dbId);
    const localSessions = await getSessions();
    const localById = new Map(localSessions.map(s => [s.id, s]));
    const localByNotion = new Map(
      localSessions.filter(s => s.notionPageId).map(s => [s.notionPageId!, s])
    );

    // Track which Notion page IDs still exist
    const activeNotionPageIds = new Set<string>();

    for (const page of allPages) {
      if (page.archived) continue;
      activeNotionPageIds.add(page.id);

      // Only process recently edited pages for upsert (if we have a lastSync)
      if (lastSync) {
        const editTime = new Date(page.last_edited_time).getTime();
        const syncTime = new Date(lastSync).getTime();
        if (editTime <= syncTime) continue;
      }

      const { session: notionSession, contrlId } = notionPageToSession(page);

      // Find matching local session
      const localSession = (contrlId ? localById.get(contrlId) : null)
        ?? localByNotion.get(page.id);

      if (localSession) {
        // Conflict resolution: last-edit-wins with 2min Notion bias
        const notionEditTime = new Date(page.last_edited_time).getTime();
        const localEditTime = localSession.updatedAt
          ? new Date(localSession.updatedAt).getTime()
          : 0;
        const diff = Math.abs(notionEditTime - localEditTime);
        const notionWins = notionEditTime > localEditTime || diff < 120000;

        if (notionWins) {
          await upsertSessionFromNotion({
            ...localSession,
            ...notionSession,
            id: localSession.id,
            notionPageId: page.id,
          } as WorkoutSession);
          count++;
          result.debug.push(`Updated session ${localSession.id} from Notion`);
        }
      } else {
        // New session from Notion
        await upsertSessionFromNotion({
          id: notionSession.id ?? `notion-${page.id}`,
          date: notionSession.date ?? new Date().toISOString(),
          level: notionSession.level ?? 1,
          category: notionSession.category ?? 'push',
          exercises: notionSession.exercises ?? [],
          notes: notionSession.notes,
          notionPageId: page.id,
          updatedAt: page.last_edited_time,
        });
        count++;
        result.debug.push(`Created session from Notion: ${notionSession.id}`);
      }

      // Write contrl ID back to Notion if missing
      if (!contrlId && localSession) {
        try {
          await updatePage(token, page.id, {
            'contrl ID': { rich_text: [{ text: { content: localSession.id } }] },
          });
        } catch {
          // Non-critical — skip
        }
      }
    }

    // Delete local sessions that were removed from Notion
    for (const local of localSessions) {
      if (local.notionPageId && !activeNotionPageIds.has(local.notionPageId)) {
        await deleteSession(local.id);
        count++;
        result.debug.push(`Deleted local session ${local.id} (removed from Notion)`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Pull sessions failed: ${msg}`);
  }
  return count;
}

// ── Push Sessions ───────────────────────────────────────────

async function pushSessions(
  token: string,
  dbId: string,
  lastSync: string | null,
  result: SyncResult,
): Promise<number> {
  let count = 0;
  try {
    const unsynced = await getUnsyncedSessions(lastSync);

    // Build exercise ID → Notion page ID map for relations
    const allExercises = await getExercises();
    const exerciseNotionMap = new Map<string, string>();
    for (const ex of allExercises) {
      if (ex.notionPageId) exerciseNotionMap.set(ex.id, ex.notionPageId);
    }

    for (const session of unsynced) {
      try {
        // Resolve exercise Notion page IDs for this session
        const exercisePageIds = session.exercises
          .map(e => exerciseNotionMap.get(e.exerciseId))
          .filter((id): id is string => !!id);

        if (session.notionPageId) {
          await updatePage(token, session.notionPageId, sessionToNotionProperties(session, exercisePageIds));
          result.debug.push(`Updated Notion page for session ${session.id}`);
        } else {
          const page = await createPage(token, dbId, sessionToNotionProperties(session, exercisePageIds));
          await setSessionNotionPageId(session.id, page.id);
          result.debug.push(`Created Notion page for session ${session.id}`);
        }
        count++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Push session ${session.id} failed: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Push sessions failed: ${msg}`);
  }
  return count;
}

// ── Process Deletions ───────────────────────────────────────

async function processDeletions(
  token: string,
  lastSync: string | null,
  result: SyncResult,
): Promise<void> {
  // Skip deletions on first sync (no previous lastSync)
  if (!lastSync) return;

  try {
    const deletions = await getPendingDeletions();
    const cleared: number[] = [];

    for (const del of deletions) {
      try {
        await archivePage(token, del.notionPageId);
        cleared.push(del.id);
        result.debug.push(`Archived Notion page for deleted ${del.entityType} ${del.entityId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Archive ${del.entityType} ${del.entityId} failed: ${msg}`);
      }
    }

    if (cleared.length > 0) {
      await clearDeletions(cleared);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Process deletions failed: ${msg}`);
  }
}
