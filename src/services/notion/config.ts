import * as SecureStore from 'expo-secure-store';

const KEYS = {
  token: 'contrl_notion_token',
  sessionsDbId: 'contrl_sessions_db_id',
  exercisesDbId: 'contrl_exercises_db_id',
  lastSync: 'contrl_last_sync',
  autoSync: 'contrl_auto_sync',
};

export async function getNotionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.token);
}

export async function setNotionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.token, token);
}

export async function getSessionsDbId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.sessionsDbId);
}

export async function setSessionsDbId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.sessionsDbId, id);
}

export async function getExercisesDbId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.exercisesDbId);
}

export async function setExercisesDbId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.exercisesDbId, id);
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  const val = await SecureStore.getItemAsync(KEYS.lastSync);
  return val || null;
}

export async function setLastSyncTimestamp(ts: string): Promise<void> {
  if (ts) {
    await SecureStore.setItemAsync(KEYS.lastSync, ts);
  } else {
    await SecureStore.deleteItemAsync(KEYS.lastSync);
  }
}

export async function isAutoSyncEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(KEYS.autoSync);
  return val === 'true';
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.autoSync, enabled ? 'true' : 'false');
}

export async function isNotionConfigured(): Promise<boolean> {
  const token = await getNotionToken();
  const sessionsDb = await getSessionsDbId();
  return !!(token && sessionsDb);
}

export async function clearNotionConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.token);
  await SecureStore.deleteItemAsync(KEYS.sessionsDbId);
  await SecureStore.deleteItemAsync(KEYS.exercisesDbId);
  await SecureStore.deleteItemAsync(KEYS.lastSync);
  await SecureStore.deleteItemAsync(KEYS.autoSync);
}
