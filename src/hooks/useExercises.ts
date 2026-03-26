import { useState, useEffect } from 'react';
import { getExercises } from '@/services/database';
import type { Exercise } from '@/types';

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExercises()
      .then(setExercises)
      .finally(() => setLoading(false));
  }, []);

  const reload = async () => {
    const data = await getExercises();
    setExercises(data);
  };

  return { exercises, loading, reload };
}
