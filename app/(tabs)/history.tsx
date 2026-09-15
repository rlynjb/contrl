import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, categoryColors } from '../../src/constants/theme';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { getWeekStart } from '../../src/lib/game/week-progress';
import {
  formatSeconds,
  formatSteps,
  isPlankComplete,
  isStepsComplete,
  toLocalDateKey,
} from '../../src/lib/daily-habits';
import { CategoryBadge } from '../../src/components/ui/CategoryBadge';
import * as database from '../../src/services/database';
import type { Category, WorkoutSession, ExerciseEntry, DailyHabitEntry } from '../../src/types';
import { CATEGORIES } from '../../src/types';

type WeekGroup = {
  weekStart: string;
  weekLabel: string;
  sessions: WorkoutSession[];
  categories: Set<Category>;
};

/** Compute overall percentage from exercises if not stored on session */
function computeOverallPercentage(exercises: ExerciseEntry[]): number {
  if (exercises.length === 0) return 0;
  const perExercise = exercises.map((ex) => {
    const checked = ex.checkedSets.filter(Boolean).length;
    return Math.round((checked / ex.targetSets) * 100);
  });
  return Math.round(perExercise.reduce((a, b) => a + b, 0) / perExercise.length);
}

/** Compute passed from exercises if not stored on session */
function computePassed(exercises: ExerciseEntry[]): boolean {
  return exercises.every((ex) => ex.hitTarget);
}

/** Per-exercise percentage */
function exercisePercentage(ex: ExerciseEntry): number {
  const checked = ex.checkedSets.filter(Boolean).length;
  return Math.round((checked / ex.targetSets) * 100);
}

export default function HistoryScreen() {
  const { status, error, sessions, reload } = useGameState();
  const { exercises, error: exercisesError, reload: reloadExercises } = useExercises();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [habitEntries, setHabitEntries] = useState<Record<string, DailyHabitEntry>>({});

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ex of exercises) {
      map[ex.id] = ex.name;
    }
    return map;
  }, [exercises]);

  const weekGroups = useMemo((): WeekGroup[] => {
    const groups = new Map<string, WorkoutSession[]>();
    for (const s of sessions) {
      const ws = getWeekStart(new Date(s.date));
      if (!groups.has(ws)) groups.set(ws, []);
      groups.get(ws)!.push(s);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekStart, weekSessions]) => {
        const start = new Date(weekStart + 'T00:00:00');
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const fmt = (d: Date) =>
          d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          weekStart,
          weekLabel: `${fmt(start)} \u2013 ${fmt(end)}`,
          sessions: weekSessions.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          ),
          categories: new Set(weekSessions.map((s) => s.category)),
        };
      });
  }, [sessions]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;

    async function loadHabits() {
      const weekStarts = new Set<string>([getWeekStart(new Date())]);
      for (const session of sessions) {
        weekStarts.add(getWeekStart(new Date(session.date)));
      }

      const sortedStarts = Array.from(weekStarts).sort();
      const first = sortedStarts[0];
      const lastStart = sortedStarts[sortedStarts.length - 1];
      const last = new Date(lastStart + 'T00:00:00');
      last.setDate(last.getDate() + 6);
      const end = toLocalDateKey(last);

      const entries = await database.getDailyHabitsInRange(first, end);
      if (cancelled) return;

      const byDate: Record<string, DailyHabitEntry> = {};
      for (const entry of entries) byDate[entry.date] = entry;
      setHabitEntries(byDate);
    }

    loadHabits().catch(() => {});
    return () => { cancelled = true; };
  }, [sessions]));

  const displayWeekGroups = useMemo((): WeekGroup[] => {
    const groups = new Map<string, WorkoutSession[]>();
    for (const group of weekGroups) {
      groups.set(group.weekStart, [...group.sessions]);
    }
    for (const entry of Object.values(habitEntries)) {
      const weekStart = getWeekStart(new Date(entry.date + 'T00:00:00'));
      if (!groups.has(weekStart)) groups.set(weekStart, []);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekStart, weekSessions]) => {
        const start = new Date(weekStart + 'T00:00:00');
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const fmt = (d: Date) =>
          d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          weekStart,
          weekLabel: `${fmt(start)} \u2013 ${fmt(end)}`,
          sessions: weekSessions.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          ),
          categories: new Set(weekSessions.map((s) => s.category)),
        };
      });
  }, [habitEntries, weekGroups]);

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
        <Text style={styles.errorTitle}>Unable to load history</Text>
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Section header */}
      <Text style={styles.sectionLabel}>HISTORY</Text>
      <Text style={styles.sectionTitle}>Past Sessions</Text>

      {displayWeekGroups.length === 0 ? (
        <Text style={styles.emptyText}>No sessions logged yet. Start training!</Text>
      ) : (
        displayWeekGroups.map((group) => {
          const weekEnd = new Date(group.weekStart + 'T00:00:00');
          weekEnd.setDate(weekEnd.getDate() + 6);
          const weekEndKey = toLocalDateKey(weekEnd);
          const sessionDates = group.sessions.map(s => s.date.slice(0, 10));
          const habitDates = Object.keys(habitEntries).filter(date =>
            date >= group.weekStart && date <= weekEndKey
          );
          const dates = Array.from(new Set([...sessionDates, ...habitDates]))
            .sort((a, b) => b.localeCompare(a));

          return (
          <View key={group.weekStart} style={styles.weekGroup}>
            {/* Week header */}
            <View style={styles.weekHeader}>
              <Text style={styles.weekDate}>{group.weekLabel}</Text>
              <View style={styles.weekDots}>
                {CATEGORIES.map((cat) => (
                  <View
                    key={cat}
                    style={[
                      styles.weekDot,
                      {
                        backgroundColor: group.categories.has(cat)
                          ? categoryColors[cat]
                          : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            {dates.map((date) => {
              const habit = habitEntries[date];
              const dateSessions = group.sessions.filter(s => s.date.slice(0, 10) === date);

              return (
                <View key={date}>
                  {habit && (
                    <View style={styles.habitSummaryRow}>
                      <Text style={styles.habitDate}>{formatShortDate(date)}</Text>
                      <View style={styles.habitSummaryItem}>
                        <Feather
                          name={isStepsComplete(habit) ? 'check' : 'minus'}
                          size={12}
                          color={isStepsComplete(habit) ? colors.success : colors.muted}
                        />
                        <Text style={styles.habitSummaryText}>
                          Steps {formatSteps(habit.stepsCount)} / {formatSteps(habit.stepsGoal)}
                        </Text>
                      </View>
                      <View style={styles.habitSummaryItem}>
                        <Feather
                          name={isPlankComplete(habit) ? 'check' : 'minus'}
                          size={12}
                          color={isPlankComplete(habit) ? colors.success : colors.muted}
                        />
                        <Text style={styles.habitSummaryText}>
                          Plank {formatSeconds(habit.plankSeconds)} / {formatSeconds(habit.plankGoalSeconds)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {dateSessions.map((session) => {
                    const key = `${date}-${session.id}`;
                    const isExpanded = expanded === key;
                    const passed = session.passed ?? computePassed(session.exercises);
                    const percentage = computeOverallPercentage(session.exercises);
                    const dateLabel = formatShortDate(session.date);

                    return (
                      <Pressable
                        key={session.id}
                        onPress={() => setExpanded(isExpanded ? null : key)}
                        style={styles.sessionCard}
                      >
                        {/* Collapsed row */}
                        <View style={styles.sessionRow}>
                          <View style={styles.sessionLeft}>
                            <Text style={styles.sessionDate}>{dateLabel}</Text>
                            <CategoryBadge category={session.category} size="sm" />
                            <Text style={styles.sessionLevel}>L{session.level}</Text>
                          </View>
                          <View style={styles.sessionRight}>
                            <Feather
                              name={passed ? 'check' : 'minus'}
                              size={14}
                              color={passed ? colors.success : colors.muted}
                            />
                            <Text
                              style={[
                                styles.percentageText,
                                { color: passed ? colors.success : colors.warning },
                              ]}
                            >
                              {percentage}%
                            </Text>
                            <Feather
                              name="chevron-right"
                              size={12}
                              color={colors.textSecondary}
                              style={{
                                transform: [{ rotate: isExpanded ? '90deg' : '0deg' }],
                              }}
                            />
                          </View>
                        </View>

                        {/* Expanded exercise breakdown */}
                        {isExpanded && (
                          <View style={styles.expandedSection}>
                            {session.exercises.map((entry) => {
                              const name =
                                exerciseNameMap[entry.exerciseId] ?? entry.exerciseId;
                              const hit = entry.hitTarget;
                              const pct = exercisePercentage(entry);
                              return (
                                <View key={entry.exerciseId} style={styles.exerciseRow}>
                                  <View style={styles.exerciseInfo}>
                                    <View style={styles.exerciseNameRow}>
                                      <Feather
                                        name={hit ? 'check' : 'minus'}
                                        size={12}
                                        color={hit ? colors.success : colors.muted}
                                      />
                                      <Text style={styles.exerciseName}>{name}</Text>
                                    </View>
                                    <Text
                                      style={[
                                        styles.exercisePct,
                                        {
                                          color: hit ? colors.success : colors.warning,
                                        },
                                      ]}
                                    >
                                      {pct}%
                                    </Text>
                                  </View>
                                  {/* Progress bar */}
                                  <View style={styles.progressTrack}>
                                    <View
                                      style={[
                                        styles.progressFill,
                                        {
                                          width: `${Math.min(pct, 100)}%`,
                                          backgroundColor: hit
                                            ? colors.success
                                            : colors.warning,
                                        },
                                      ]}
                                    />
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
          );
        })
      )}
    </ScrollView>
  );
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { weekday: 'short' }).replace('.', '');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 60,
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

  // Section header
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
    color: colors.text,
    marginBottom: 20,
  },

  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 60,
  },

  // Week
  weekGroup: {
    marginBottom: 24,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekDate: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  weekDots: {
    flexDirection: 'row',
    gap: 5,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 0,
  },

  // Daily habits
  habitSummaryRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  habitDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    minWidth: 28,
  },
  habitSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  habitSummaryText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },

  // Session card
  sessionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    minWidth: 28,
  },
  sessionLevel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  sessionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  consecutiveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  consecutiveText: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  percentageText: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
  },

  // Expanded section
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  exerciseRow: {
    marginBottom: 10,
  },
  exerciseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exerciseName: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  exercisePct: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 0,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 0,
  },
});
