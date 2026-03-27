import { useState, useEffect } from 'react';
import { getExercises } from '@/services/database';
import { useNotionSync } from './NotionSyncContext';
import type { Exercise } from '@/types';

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const { syncVersion } = useNotionSync();

  useEffect(() => {
    getExercises()
      .then(setExercises)
      .finally(() => setLoading(false));
  }, [syncVersion]);

  return { exercises, loading };
}
