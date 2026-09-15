import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '@/constants/theme';
import type { DailyHabitEntry, DailyHabitSettings } from '@/types';
import {
  formatSeconds,
  formatSteps,
  PLANK_GOALS,
  STEP_GOALS,
} from '@/lib/daily-habits';
import { HoldTimerModal } from './ui/HoldTimerModal';

type Props = {
  today: DailyHabitEntry | null;
  settings: DailyHabitSettings;
  onUpdateSteps: (stepsCount: number) => Promise<void>;
  onUpdatePlank: (plankSeconds: number) => Promise<void>;
  onUpdateSettings: (settings: DailyHabitSettings) => Promise<void>;
};

type EntryMode = 'steps' | 'plank' | 'plankGoal';

export function DailyHabitPanel({
  today,
  settings,
  onUpdateSteps,
  onUpdatePlank,
  onUpdateSettings,
}: Props) {
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [entryValue, setEntryValue] = useState('');
  const [timerVisible, setTimerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepsValue = today?.stepsCount ?? null;
  const stepsGoal = today?.stepsGoal ?? settings.dailyStepsGoal;
  const plankValue = today?.plankSeconds ?? null;
  const plankGoal = today?.plankGoalSeconds ?? settings.dailyPlankGoalSeconds;
  const stepsPct = stepsGoal > 0 && stepsValue != null
    ? Math.min(100, Math.round((stepsValue / stepsGoal) * 100))
    : 0;
  const plankPct = plankGoal > 0 && plankValue != null
    ? Math.min(100, Math.round((plankValue / plankGoal) * 100))
    : 0;

  useEffect(() => {
    if (!entryMode) setEntryValue('');
  }, [entryMode]);

  const openEntry = (mode: EntryMode) => {
    setEntryMode(mode);
    if (mode === 'steps') setEntryValue(stepsValue != null ? String(stepsValue) : '');
    if (mode === 'plank') setEntryValue(plankValue != null ? String(plankValue) : '');
    if (mode === 'plankGoal') setEntryValue(String(plankGoal));
  };

  const saveEntry = async () => {
    if (!entryMode || saving) return;
    const nextValue = Math.max(0, Math.floor(Number(entryValue) || 0));
    setSaving(true);
    try {
      if (entryMode === 'steps') await onUpdateSteps(nextValue);
      if (entryMode === 'plank') await onUpdatePlank(nextValue);
      if (entryMode === 'plankGoal') {
        await onUpdateSettings({
          ...settings,
          dailyPlankGoalSeconds: nextValue,
        });
      }
      setEntryMode(null);
    } finally {
      setSaving(false);
    }
  };

  const entryTitle = entryMode === 'steps'
    ? 'Steps'
    : entryMode === 'plank'
      ? 'Plank seconds'
      : 'Plank goal';

  return (
    <View style={styles.dailyCard}>
      <View style={styles.habitRow}>
        <View style={[styles.habitIcon, styles.stepsIcon]}>
          <Feather name="navigation" size={16} color={colors.success} />
        </View>
        <View style={styles.habitMain}>
          <View style={styles.habitTitle}>
            <Text style={styles.habitName}>Steps</Text>
            <Text style={styles.habitValue}>
              {formatSteps(stepsValue)} / {formatSteps(stepsGoal)}
            </Text>
          </View>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityLabel={`Steps progress, ${stepsValue ?? 0} of ${stepsGoal}`}
          >
            <View style={[styles.progressFill, styles.stepsFill, { width: `${stepsPct}%` }]} />
          </View>
        </View>
        <Pressable style={styles.habitAction} onPress={() => openEntry('steps')}>
          <Text style={styles.habitActionText}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.goalGrid}>
        {STEP_GOALS.map(goal => (
          <Pressable
            key={goal}
            style={[styles.goalChip, stepsGoal === goal && styles.stepsGoalActive]}
            onPress={() => onUpdateSettings({ ...settings, dailyStepsGoal: goal })}
          >
            <Text style={[styles.goalText, stepsGoal === goal && styles.goalTextActive]}>
              {goal / 1000}K
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.divider} />

      <View style={styles.habitRow}>
        <View style={[styles.habitIcon, styles.plankIcon]}>
          <Feather name="clock" size={16} color={colors.primary} />
        </View>
        <View style={styles.habitMain}>
          <View style={styles.habitTitle}>
            <Text style={styles.habitName}>Plank</Text>
            <Text style={styles.habitValue}>
              {formatSeconds(plankValue)} / {formatSeconds(plankGoal)}
            </Text>
          </View>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityLabel={`Plank progress, ${plankValue ?? 0} of ${plankGoal} seconds`}
          >
            <View style={[styles.progressFill, styles.plankFill, { width: `${plankPct}%` }]} />
          </View>
        </View>
        <Pressable
          style={styles.habitAction}
          onPress={() => setTimerVisible(true)}
          accessibilityLabel="Start plank timer"
        >
          <Feather name="play" size={13} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.goalGrid}>
        {PLANK_GOALS.map(goal => (
          <Pressable
            key={goal}
            style={[styles.goalChip, plankGoal === goal && styles.plankGoalActive]}
            onPress={() => onUpdateSettings({ ...settings, dailyPlankGoalSeconds: goal })}
          >
            <Text style={[styles.goalText, plankGoal === goal && styles.goalTextActive]}>
              {goal}s
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.goalChip, !PLANK_GOALS.includes(plankGoal as 30 | 45 | 60 | 90) && styles.plankGoalActive]}
          onPress={() => openEntry('plankGoal')}
        >
          <Text
            style={[
              styles.goalText,
              !PLANK_GOALS.includes(plankGoal as 30 | 45 | 60 | 90) && styles.goalTextActive,
            ]}
          >
            Custom
          </Text>
        </Pressable>
        <Pressable style={styles.goalChip} onPress={() => openEntry('plank')}>
          <Text style={styles.goalText}>Log</Text>
        </Pressable>
      </View>

      <Modal
        visible={entryMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEntryMode(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{entryTitle}</Text>
            <TextInput
              style={styles.modalInput}
              value={entryValue}
              onChangeText={setEntryValue}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setEntryMode(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveEntry}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>{saving ? 'Saving' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <HoldTimerModal
        visible={timerVisible}
        targetSeconds={plankGoal}
        exerciseName="Daily Plank"
        setLabel="Today"
        onComplete={(seconds) => {
          setTimerVisible(false);
          onUpdatePlank(seconds);
        }}
        onCancel={() => setTimerVisible(false)}
      />
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
  habitMain: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  habitTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
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
  progressTrack: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 0,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 0,
  },
  stepsFill: {
    backgroundColor: colors.success,
  },
  plankFill: {
    backgroundColor: colors.primary,
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
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  goalChip: {
    minWidth: 44,
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsGoalActive: {
    borderColor: colors.success + '55',
    backgroundColor: colors.successDim,
  },
  plankGoalActive: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryDim,
  },
  goalText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  goalTextActive: {
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,8,15,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    width: '100%',
    maxWidth: 320,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  modalInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  saveButton: {
    borderRadius: 2,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButtonText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
