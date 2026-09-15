import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fonts, categoryColors } from '../../src/constants/theme';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { SkillTree } from '../../src/components/SkillTree';
import { DailyHabitPanel } from '../../src/components/DailyHabitPanel';
import { HabitWeekMarks } from '../../src/components/HabitWeekMarks';
import { useDailyHabits } from '../../src/hooks/useDailyHabits';
import { getWeekDateKeys } from '../../src/lib/daily-habits';
import type { Category } from '../../src/types';

/** Short uppercase labels */
const categoryLabel: Record<Category, string> = {
  push: 'PUSH',
  pull: 'PULL',
  squat: 'SQUAT',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export default function HomeScreen() {
  const {
    status,
    error,
    user,
    sessions,
    reload,
  } = useGameState();

  const { error: exercisesError, reload: reloadExercises } = useExercises();
  const {
    today,
    weekEntries,
    settings: habitSettings,
    updateSteps,
    updatePlank,
    updateSettings,
  } = useDailyHabits();

  const weekDateKeys = useMemo(() => getWeekDateKeys(), []);

  // Build a map of session dates this week keyed by day-of-week index (0=Mon)
  const weekDaySessions = useMemo<(null | { category: Category; level: number })[]>(() => {
    if (!sessions || !user) return new Array(7).fill(null);

    const now = new Date();
    const offsetFromMonday = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - offsetFromMonday);
    weekStartDate.setHours(0, 0, 0, 0);

    const result: (null | { category: Category; level: number })[] = new Array(7).fill(null);

    for (const s of sessions) {
      const sDate = new Date(s.date);
      if (sDate >= weekStartDate) {
        const sDay = (sDate.getDay() + 6) % 7;
        result[sDay] = { category: s.category, level: s.level };
      }
    }

    return result;
  }, [sessions, user]);

  const todayIndex = (new Date().getDay() + 6) % 7;

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (status === 'error' || exercisesError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorTitle}>Unable to load home screen</Text>
        <Text style={styles.errorText}>{error ?? exercisesError ?? 'Unknown error'}</Text>
        <Pressable style={styles.retryButton} onPress={() => {
          reloadExercises();
          reload();
        }}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!user) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ─── WEEKLY OVERVIEW ─── */}
      <View style={styles.weekSection}>
        <Text style={styles.sectionHeader}>THIS WEEK</Text>

        {/* 7-day strip */}
        <View style={styles.weekStrip}>
          {DAY_LABELS.map((label, i) => {
            const session = weekDaySessions[i];
            const isToday = i === todayIndex;
            const hasSession = !!session;
            const accent = hasSession ? categoryColors[session.category] : null;

            return (
              <View key={i} style={styles.dayColumn}>
                <Text style={[
                  styles.dayLabel,
                  { color: hasSession ? accent! : isToday ? colors.primary : colors.textSecondary },
                ]}>
                  {label}
                </Text>

                <View style={[
                  styles.dayDot,
                  {
                    backgroundColor: hasSession ? accent! : colors.surfaceLight,
                    borderWidth: isToday && !hasSession ? 1 : 0,
                    borderColor: isToday && !hasSession ? 'rgba(0,229,255,0.25)' : 'transparent',
                  },
                ]} />

                <Text style={[
                  styles.dayCatLabel,
                  { color: hasSession ? accent! : 'transparent' },
                ]}>
                  {hasSession ? categoryLabel[session.category] : ''}
                </Text>

                {habitSettings?.showDailyHabitsOnHome !== false && (
                  <HabitWeekMarks entry={weekEntries[weekDateKeys[i]] ?? null} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      {habitSettings?.showDailyHabitsOnHome !== false && habitSettings && (
        <View style={styles.todaySection}>
          <Text style={styles.sectionHeader}>TODAY</Text>
          <DailyHabitPanel
            today={today}
            settings={habitSettings}
            onUpdateSteps={updateSteps}
            onUpdatePlank={updatePlank}
            onUpdateSettings={updateSettings}
          />
        </View>
      )}

      {/* ─── SKILL TREE (active-level nodes render as workout cards) ─── */}
      <View style={styles.section}>
        <SkillTree hideSectionLabel />
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },

  // ── Week strip ──────────────────────────
  weekSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    maxWidth: 320,
    alignSelf: 'center',
    width: '100%',
  },
  dayColumn: {
    alignItems: 'center',
    gap: 3,
  },
  dayLabel: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 0.4,
  },
  dayDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dayCatLabel: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 0.4,
    height: 10,
  },

  // ── Sections ────────────────────────────
  section: {
    marginBottom: 16,
  },
  todaySection: {
    marginBottom: 22,
  },
});
