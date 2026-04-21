import { useEffect, useState } from 'react';
import { getDatabase } from '../services/database';

export function useDatabase() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase()
      .then(() => {
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to open local database';
        setError(message);
      });
  }, []);

  return { ready, error };
}
