import { View, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import type { DailyHabitEntry } from '@/types';
import { isPlankComplete, isStepsComplete } from '@/lib/daily-habits';

type Props = {
  entry: DailyHabitEntry | null;
};

export function HabitWeekMarks({ entry }: Props) {
  const stepsDone = isStepsComplete(entry);
  const plankDone = isPlankComplete(entry);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Steps ${stepsDone ? 'complete' : 'not complete'}, plank ${plankDone ? 'complete' : 'not complete'}`}
    >
      <View style={[styles.mark, stepsDone && styles.stepsDone]} />
      <View style={[styles.mark, plankDone && styles.plankDone]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 3,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 5,
    height: 5,
    borderRadius: 0,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
  stepsDone: {
    backgroundColor: colors.success,
    opacity: 1,
  },
  plankDone: {
    backgroundColor: colors.primary,
    opacity: 1,
  },
});
