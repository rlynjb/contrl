import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, categoryColors } from '@/constants/theme';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useExerciseForm } from '@/hooks/useExerciseForm';
import type { Category, Exercise, WorkoutSession, DraftSession } from '@/types';

type ExerciseFormProps = {
  category: Category;
  level: number;
  exercises: Exercise[];
  sessions: WorkoutSession[];
  saving: boolean;
  saveError: string | null;
  draft: DraftSession | null;
  onSave: (session: WorkoutSession) => void;
  onSaveDraft: (draft: DraftSession) => void;
};

export function ExerciseForm({
  category,
  level,
  exercises,
  sessions,
  saving,
  saveError,
  draft,
  onSave,
  onSaveDraft,
}: ExerciseFormProps) {
  const {
    levelExercises,
    lastSession,
    exerciseState,
    notes,
    setNotes,
    toggleSet,
    updateValue,
    buildSession,
  } = useExerciseForm({ category, level, exercises, sessions, draft, onSaveDraft });

  const handleSave = () => {
    if (saving) return;
    onSave(buildSession());
  };

  const catColor = categoryColors[category];

  return (
    <View style={styles.container}>
      {levelExercises.map((ex, exIdx) => {
        const state = exerciseState[exIdx];
        if (!state) return null;
        const checkedCount = state.checkedSets.filter(Boolean).length;
        const target = ex.isHold
          ? `${ex.targetSets}x${ex.targetHoldSeconds}s`
          : `${ex.targetSets}x${ex.targetReps}`;
        const pct = Math.round((checkedCount / ex.targetSets) * 100);

        return (
          <View key={ex.id} style={styles.exerciseBlock}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
              <Text style={[styles.target, { color: catColor }]}>{target}</Text>
            </View>

            <ProgressBar
              value={pct}
              color={category}
              height={4}
            />

            <View style={styles.setsContainer}>
              {state.checkedSets.map((checked, setIdx) => {
                const lastEntry = lastSession?.exercises.find(e => e.exerciseId === ex.id);
                const lastVal = ex.isHold
                  ? lastEntry?.actualHoldSeconds?.[setIdx]
                  : lastEntry?.actualReps[setIdx];
                const currentVal = ex.isHold
                  ? (state.actualHoldSeconds?.[setIdx] ?? 0)
                  : state.actualReps[setIdx];

                return (
                  <View key={setIdx} style={styles.setRow}>
                    <Pressable
                      onPress={() => toggleSet(exIdx, setIdx)}
                      style={[
                        styles.checkbox,
                        checked && { backgroundColor: catColor, borderColor: catColor },
                      ]}
                    >
                      {checked && <Text style={styles.checkmark}>{'✓'}</Text>}
                    </Pressable>

                    <Text style={styles.setLabel}>S{setIdx + 1}</Text>

                    <TextInput
                      style={styles.valueInput}
                      value={String(currentVal)}
                      onChangeText={t => {
                        const num = parseInt(t, 10);
                        if (!isNaN(num) && num >= 0) {
                          updateValue(exIdx, setIdx, num, ex.isHold);
                        } else if (t === '') {
                          updateValue(exIdx, setIdx, 0, ex.isHold);
                        }
                      }}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />

                    <Text style={styles.targetVal}>
                      / {ex.isHold ? `${ex.targetHoldSeconds}s` : ex.targetReps}
                    </Text>

                    {lastVal !== undefined && (
                      <Text style={styles.lastHint}>Last: {lastVal}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <TextInput
        style={styles.notesInput}
        placeholder="Notes (optional)"
        placeholderTextColor={colors.muted}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {saveError && (
        <Text style={styles.error}>{saveError}</Text>
      )}

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.saveButton, { borderColor: `${catColor}30`, backgroundColor: `${catColor}15` }]}
      >
        <Text style={[styles.saveButtonText, { color: catColor }]}>
          {saving ? 'Saving...' : 'Log Session'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
  exerciseBlock: {
    marginBottom: 20,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  target: {
    fontSize: 12,
    fontWeight: '700',
  },
  setsContainer: {
    marginTop: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '700',
  },
  setLabel: {
    fontSize: 12,
    color: colors.muted,
    width: 24,
    textAlign: 'center',
  },
  valueInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    width: 56,
    textAlign: 'center',
  },
  targetVal: {
    fontSize: 12,
    color: colors.muted,
  },
  lastHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  notesInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  saveButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
