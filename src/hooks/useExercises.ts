import { useState, useEffect } from 'react';
import { getExercises } from '@/services/database';
import { useNotionSync } from './NotionSyncContext';
import type { Exercise } from '@/types';

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { syncVersion } = useNotionSync();

  useEffect(() => {
    setLoading(true);
    getExercises()
      .then(rows => {
        setExercises(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load exercises';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [reloadToken, syncVersion]);

  return {
    exercises,
    loading,
    error,
    reload: () => setReloadToken(prev => prev + 1),
  };
}
