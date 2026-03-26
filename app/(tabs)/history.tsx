import { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, categoryColors, categoryBg, categoryBorder } from '../../src/constants/theme';
import { LEVEL_NAMES } from '../../src/lib/constants';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { getWeekStart } from '../../src/lib/game/week-progress';
import { CategoryBadge } from '../../src/components/ui/CategoryBadge';
import type { Category, WorkoutSession } from '../../src/types';
import { CATEGORIES } from '../../src/types';

type WeekGroup = {
  weekStart: string;
  sessions: WorkoutSession[];
  categories: Set<Category>;
};

export default function HistoryScreen() {
  const { status, sessions, streak } = useGameState();
  const { exercises } = useExercises();

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
      .map(([weekStart, weekSessions]) => ({
        weekStart,
        sessions: weekSessions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        categories: new Set(weekSessions.map(s => s.category)),
      }));
  }, [sessions]);

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        {streak > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>{streak}w streak</Text>
          </View>
        )}
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>No sessions logged yet. Start training!</Text>
      ) : (
        weekGroups.map(group => (
          <View key={group.weekStart} style={styles.weekGroup}>
            {/* Week header */}
            <View style={styles.weekHeader}>
              <Text style={styles.weekDate}>
                Week of {formatWeekDate(group.weekStart)}
              </Text>
              <View style={styles.weekDots}>
                {CATEGORIES.map(cat => (
                  <View
                    key={cat}
                    style={[
                      styles.weekDot,
                      {
                        backgroundColor: group.categories.has(cat)
                          ? categoryColors[cat]
                          : colors.surfaceLight,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Session cards */}
            {group.sessions.map(session => (
              <View
                key={session.id}
                style={[
                  styles.sessionCard,
                  {
                    borderLeftColor: categoryColors[session.category],
                    backgroundColor: categoryBg[session.category],
                  },
                ]}
              >
                <View style={styles.sessionHeader}>
                  <CategoryBadge category={session.category} size="sm" />
                  <Text style={styles.sessionLevel}>
                    {LEVEL_NAMES[session.level] ?? `L${session.level}`}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {formatSessionDate(session.date)}
                  </Text>
                </View>

                {/* Exercise summary */}
                <View style={styles.exerciseSummary}>
                  {session.exercises.map(entry => {
                    const name = exerciseNameMap[entry.exerciseId] ?? entry.exerciseId;
                    const checked = entry.checkedSets.filter(Boolean).length;
                    return (
                      <View key={entry.exerciseId} style={styles.exerciseLine}>
                        <Text
                          style={[
                            styles.exerciseName,
                            entry.hitTarget && styles.exerciseHit,
                          ]}
                          numberOfLines={1}
                        >
                          {entry.hitTarget ? '✓ ' : ''}{name}
                        </Text>
                        <Text style={styles.exerciseStats}>
                          {checked}/{entry.targetSets} sets
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {session.notes && (
                  <Text style={styles.sessionNotes} numberOfLines={2}>
                    {session.notes}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function formatWeekDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSessionDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  streakBadge: {
    backgroundColor: colors.warningDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 60,
  },
  weekGroup: {
    marginBottom: 24,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekDate: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekDots: {
    flexDirection: 'row',
    gap: 6,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionCard: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sessionLevel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sessionDate: {
    fontSize: 12,
    color: colors.muted,
    marginLeft: 'auto',
  },
  exerciseSummary: {
    gap: 4,
  },
  exerciseLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  exerciseHit: {
    color: colors.success,
  },
  exerciseStats: {
    fontSize: 12,
    color: colors.muted,
  },
  sessionNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 6,
  },
});
