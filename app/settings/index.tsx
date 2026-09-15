import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts } from '../../src/constants/theme';
import { STEP_GOALS } from '../../src/lib/daily-habits';
import { useDailyHabits } from '../../src/hooks/useDailyHabits';
import { getSyncState, getAllSyncMeta } from '../../src/services/database';
import { pushChanges, isSyncConfigured } from '../../src/services/sync';

type SyncState = { lastPushedAt: string | null; lastPulledAt: string | null };
type SyncMetaRow = { tableName: string; lastSyncedAt: string | null };

function formatTimeSince(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Just now';
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function SettingsScreen() {
  const [sync, setSync] = useState<SyncState>({ lastPushedAt: null, lastPulledAt: null });
  const [pushing, setPushing] = useState(false);
  const [ledger, setLedger] = useState<SyncMetaRow[]>([]);
  const {
    settings: habitSettings,
    updateSettings: updateHabitSettings,
  } = useDailyHabits();

  const refresh = useCallback(() => {
    getSyncState().then(setSync).catch(() => {});
    getAllSyncMeta().then(setLedger).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]));

  const onSyncNow = useCallback(async () => {
    if (pushing) return;
    setPushing(true);
    try {
      await pushChanges();
    } finally {
      setPushing(false);
      refresh();
    }
  }, [pushing, refresh]);

  const updateHabitSettingValue = useCallback(async (
    patch: Partial<NonNullable<typeof habitSettings>>
  ) => {
    if (!habitSettings) return;
    await updateHabitSettings({ ...habitSettings, ...patch });
  }, [habitSettings, updateHabitSettings]);

  const configured = isSyncConfigured();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>SUPABASE SYNC</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Status</Text>
        <Text style={styles.rowSubtitle}>{configured ? 'Configured' : 'Not configured'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Last push</Text>
        <Text style={styles.rowSubtitle}>{formatTimeSince(sync.lastPushedAt)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Last pull</Text>
        <Text style={styles.rowSubtitle}>{formatTimeSince(sync.lastPulledAt)}</Text>
      </View>
      {configured && (
        <Pressable
          style={[styles.syncButton, pushing && styles.syncButtonDisabled]}
          onPress={onSyncNow}
          disabled={pushing}
        >
          <Text style={styles.syncButtonText}>{pushing ? 'Syncing…' : 'Sync now'}</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>SYNC LEDGER</Text>
      {ledger.map(row => (
        <View key={row.tableName} style={styles.row}>
          <Text style={styles.rowLabel}>{row.tableName}</Text>
          <Text style={styles.rowSubtitle}>{formatTimeSince(row.lastSyncedAt)}</Text>
        </View>
      ))}

      {habitSettings && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>DAILY HABITS</Text>
          <View style={styles.goalBlock}>
            <Text style={styles.rowLabel}>Daily step goal</Text>
            <View style={styles.goalGrid}>
              {STEP_GOALS.map(goal => (
                <Pressable
                  key={goal}
                  style={[
                    styles.goalChip,
                    habitSettings.dailyStepsGoal === goal && styles.goalChipActive,
                  ]}
                  onPress={() => updateHabitSettingValue({ dailyStepsGoal: goal })}
                >
                  <Text
                    style={[
                      styles.goalChipText,
                      habitSettings.dailyStepsGoal === goal && styles.goalChipTextActive,
                    ]}
                  >
                    {goal / 1000}K
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>Daily plank</Text>
              <Text style={styles.rowSubtitle}>Fixed at 4 sets · 60s</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>Show on Home</Text>
              <Text style={styles.rowSubtitle}>Today card and weekly habit marks</Text>
            </View>
            <Switch
              value={habitSettings.showDailyHabitsOnHome}
              onValueChange={(value) => updateHabitSettingValue({ showDailyHabitsOnHome: value })}
              trackColor={{ false: colors.border, true: colors.primary + '55' }}
              thumbColor={habitSettings.showDailyHabitsOnHome ? colors.primary : colors.muted}
            />
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>ABOUT</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowSubtitle}>1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  goalBlock: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalChip: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  goalChipActive: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryDim,
  },
  goalChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  goalChipTextActive: {
    color: colors.primary,
  },
  syncButton: {
    backgroundColor: colors.primaryDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
});
