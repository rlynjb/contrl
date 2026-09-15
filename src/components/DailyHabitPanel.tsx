import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '@/constants/theme';
import type { DailyHabitEntry, DailyHabitSettings } from '@/types';
import {
  FIXED_PLANK_SET_COUNT,
  FIXED_PLANK_SET_SECONDS,
  isPlankComplete,
  plankCompletedSets,
  stepsFromThousands,
  stepsToThousandsInput,
} from '@/lib/daily-habits';

type Props = {
  today: DailyHabitEntry | null;
  settings: Pick<DailyHabitSettings, 'dailyStepsGoal'>;
  onLogStepsGoal: (stepsGoal: number) => Promise<void>;
  onLogFixedPlank: () => Promise<void>;
};

export function DailyHabitPanel({
  today,
  settings,
  onLogStepsGoal,
  onLogFixedPlank,
}: Props) {
  const initialStepsInput = useMemo(
    () => stepsToThousandsInput(today?.stepsCount ?? today?.stepsGoal ?? null, settings.dailyStepsGoal),
    [settings.dailyStepsGoal, today?.stepsCount, today?.stepsGoal]
  );
  const loggedPlankSets = plankCompletedSets(today);
  const plankAlreadyComplete = isPlankComplete(today);

  const [stepsInput, setStepsInput] = useState(initialStepsInput);
  const [plankSets, setPlankSets] = useState(loggedPlankSets);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [savingSteps, setSavingSteps] = useState(false);
  const [savingPlank, setSavingPlank] = useState(false);
  const plankReadyToLog = plankSets >= FIXED_PLANK_SET_COUNT;

  useEffect(() => {
    setStepsInput(initialStepsInput);
  }, [initialStepsInput]);

  useEffect(() => {
    setPlankSets(loggedPlankSets);
  }, [loggedPlankSets]);

  const handleLogSteps = async () => {
    const stepsGoal = stepsFromThousands(stepsInput);
    if (stepsGoal == null) {
      setStepsError('Enter a goal');
      return;
    }
    setStepsError(null);
    setSavingSteps(true);
    try {
      await onLogStepsGoal(stepsGoal);
    } finally {
      setSavingSteps(false);
    }
  };

  const incrementPlankSets = () => {
    setPlankSets(current => Math.min(FIXED_PLANK_SET_COUNT, current + 1));
  };

  const handleLogPlank = async () => {
    if (plankSets < FIXED_PLANK_SET_COUNT) return;
    setSavingPlank(true);
    try {
      await onLogFixedPlank();
    } finally {
      setSavingPlank(false);
    }
  };

  return (
    <View style={styles.dailyCard}>
      <View style={styles.habitRow}>
        <View style={[styles.habitIcon, styles.stepsIcon]}>
          <Feather name="navigation" size={16} color={colors.success} />
        </View>
        <Text style={styles.habitName}>Steps</Text>
        <View style={styles.inlineActionGroup}>
          <View style={styles.goalInputWrap}>
            <Text style={styles.goalInputLabel}>Goal</Text>
            <TextInput
              style={styles.goalInput}
              value={stepsInput}
              onChangeText={(value) => {
                setStepsInput(value.replace(/[^0-9.]/g, ''));
                setStepsError(null);
              }}
              keyboardType="decimal-pad"
              accessibilityLabel="Daily step goal in thousands"
            />
            <Text style={styles.goalInputSuffix}>K</Text>
          </View>
          <Pressable
            style={[styles.habitAction, savingSteps && styles.disabledButton]}
            onPress={handleLogSteps}
            disabled={savingSteps}
            accessibilityLabel={`Log ${stepsInput || '0'} thousand steps`}
          >
            <Text style={styles.habitActionText}>{savingSteps ? 'Saving' : 'Log'}</Text>
          </Pressable>
        </View>
      </View>
      {stepsError && <Text style={styles.errorText}>{stepsError}</Text>}

      <View style={styles.divider} />

      <View style={styles.habitRow}>
        <View style={[styles.habitIcon, styles.plankIcon]}>
          <Feather name="clock" size={16} color={colors.primary} />
        </View>
        <View style={styles.plankMain}>
          <View style={styles.plankTitleRow}>
            <Text style={styles.habitName}>Plank</Text>
            <Text style={styles.setCount}>{plankAlreadyComplete ? FIXED_PLANK_SET_COUNT : plankSets}</Text>
            <Pressable
              style={[styles.setButton, (plankReadyToLog || plankAlreadyComplete) && styles.disabledButton]}
              onPress={incrementPlankSets}
              disabled={plankReadyToLog || plankAlreadyComplete}
              accessibilityLabel="Add completed plank set"
            >
              <Feather name="plus" size={14} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.habitValue}>
            of {FIXED_PLANK_SET_COUNT} sets · {FIXED_PLANK_SET_SECONDS}s
          </Text>
        </View>
        <Pressable
          style={[
            styles.habitAction,
            (!plankReadyToLog || savingPlank || plankAlreadyComplete) && styles.disabledButton,
          ]}
          onPress={handleLogPlank}
          disabled={!plankReadyToLog || savingPlank || plankAlreadyComplete}
          accessibilityLabel={
            !plankReadyToLog
              ? `Complete ${FIXED_PLANK_SET_COUNT - plankSets} more plank sets before logging`
              : 'Log completed daily plank'
          }
        >
          <Text style={styles.habitActionText}>
            {plankAlreadyComplete ? 'Done' : savingPlank ? 'Saving' : 'Log'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dailyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: 2,
    padding: 12,
    gap: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
  },
  habitIcon: {
    width: 34,
    height: 34,
    borderRadius: 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsIcon: {
    backgroundColor: colors.successDim,
    borderColor: colors.success + '30',
  },
  plankIcon: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primary + '30',
  },
  inlineActionGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minWidth: 0,
  },
  habitName: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  habitValue: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  goalInputWrap: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
    paddingLeft: 8,
    paddingRight: 7,
    minWidth: 98,
  },
  goalInputLabel: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    marginRight: 6,
  },
  goalInput: {
    minWidth: 28,
    maxWidth: 50,
    padding: 0,
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.bold,
    textAlign: 'right',
  },
  goalInputSuffix: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    marginLeft: 2,
  },
  habitAction: {
    minWidth: 42,
    height: 34,
    borderWidth: 1,
    borderColor: colors.primary + '35',
    borderRadius: 2,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  habitActionText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  plankMain: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  plankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setCount: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  setButton: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: colors.primary + '35',
    borderRadius: 2,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.danger,
    marginTop: -6,
    marginLeft: 44,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
