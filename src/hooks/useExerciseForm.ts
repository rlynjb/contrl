import { useState, useMemo, useRef, useEffect } from 'react';
import type {
  Category,
  Exercise,
  ExerciseEntry,
  ExerciseFormState,
  DraftSession,
  WorkoutSession,
} from '@/types';

interface UseExerciseFormOptions {
  category: Category;
  level: number;
  exercises: Exercise[];
  sessions: WorkoutSession[];
  draft: DraftSession | null;
  onSaveDraft: (draft: DraftSession) => void;
}

export function useExerciseForm({
  category,
  level,
  exercises,
  sessions,
  draft,
  onSaveDraft,
}: UseExerciseFormOptions) {
  const levelExercises = useMemo(
    () => exercises.filter(e => e.category === category && e.level === level),
    [exercises, category, level]
  );

  const lastSession = useMemo(() => {
    return sessions
      .filter(s => s.category === category && s.level === level)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
  }, [sessions, category, level]);

  const validDraft = draft &&
    draft.exercises.length === levelExercises.length &&
    draft.exercises.every((d, i) => d.exerciseId === levelExercises[i]?.id)
    ? draft : null;

  function buildInitialState(): ExerciseFormState[] {
    if (validDraft) return validDraft.exercises;
    return levelExercises.map(ex => {
      const lastEntry = lastSession?.exercises.find(e => e.exerciseId === ex.id);
      return {
        exerciseId: ex.id,
        checkedSets: Array(ex.targetSets).fill(false) as boolean[],
        actualReps: lastEntry
          ? [...lastEntry.actualReps]
          : Array(ex.targetSets).fill(ex.targetReps) as number[],
        actualHoldSeconds: ex.isHold
          ? (lastEntry?.actualHoldSeconds
              ? [...lastEntry.actualHoldSeconds]
              : Array(ex.targetSets).fill(ex.targetReps ?? 0) as number[])
          : undefined,
      };
    });
  }

  const [exerciseState, setExerciseState] = useState<ExerciseFormState[]>(buildInitialState);

  // Re-initialize when exercises load (they start empty and populate async)
  const prevExerciseCount = useRef(levelExercises.length);
  useEffect(() => {
    if (levelExercises.length > 0 && prevExerciseCount.current === 0) {
      setExerciseState(buildInitialState());
    }
    prevExerciseCount.current = levelExercises.length;
  }, [levelExercises.length]);

  const [notes, setNotes] = useState(validDraft?.notes ?? '');

  // Auto-save draft on 500ms debounce
  const isFirstRender = useRef(true);
  const saveDraftRef = useRef(onSaveDraft);
  saveDraftRef.current = onSaveDraft;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveDraftRef.current({
        category,
        level,
        exercises: exerciseState,
        notes,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [exerciseState, notes, category, level]);

  const toggleSet = (exIdx: number, setIdx: number) => {
    setExerciseState(prev => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      ex.checkedSets = [...ex.checkedSets];
      ex.checkedSets[setIdx] = !ex.checkedSets[setIdx];
      next[exIdx] = ex;
      return next;
    });
  };

  const updateValue = (exIdx: number, setIdx: number, value: number, isHold: boolean) => {
    setExerciseState(prev => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      if (isHold) {
        ex.actualHoldSeconds = [...(ex.actualHoldSeconds ?? [])];
        ex.actualHoldSeconds[setIdx] = value;
      } else {
        ex.actualReps = [...ex.actualReps];
        ex.actualReps[setIdx] = value;
      }
      next[exIdx] = ex;
      return next;
    });
  };

  const buildSession = (): WorkoutSession => {
    const entries: ExerciseEntry[] = levelExercises.map((ex, i) => {
      const state = exerciseState[i];
      const checkedCount = state.checkedSets.filter(Boolean).length;

      let hitTarget = true;
      for (let s = 0; s < state.checkedSets.length; s++) {
        if (!state.checkedSets[s]) continue;
        if (ex.isHold) {
          if ((state.actualHoldSeconds?.[s] ?? 0) < (ex.targetReps ?? 0)) hitTarget = false;
        } else {
          if (state.actualReps[s] < ex.targetReps) hitTarget = false;
        }
      }
      if (checkedCount < ex.targetSets) hitTarget = false;

      return {
        exerciseId: ex.id,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        actualSets: checkedCount,
        actualReps: state.actualReps,
        actualHoldSeconds: state.actualHoldSeconds,
        checkedSets: state.checkedSets,
        hitTarget,
      };
    });

    return {
      id: `${category}-${level}-${Date.now()}`,
      date: new Date().toISOString(),
      level,
      category,
      exercises: entries,
      ...(notes.trim() && { notes: notes.trim() }),
    };
  };

  return {
    levelExercises,
    lastSession,
    exerciseState,
    notes,
    setNotes,
    toggleSet,
    updateValue,
    buildSession,
  };
}
