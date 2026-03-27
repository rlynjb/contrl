import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, categoryColors, categoryBorder } from '../../src/constants/theme';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import type { Category } from '../../src/types';
import { CATEGORIES } from '../../src/types';

/** Dim backgrounds for level badges (higher opacity than categoryBg) */
const categoryDim: Record<Category, string> = {
  push: 'rgba(249,115,22,0.15)',
  pull: 'rgba(6,182,212,0.15)',
  squat: 'rgba(217,70,239,0.15)',
};

/** Short uppercase labels */
const categoryLabel: Record<Category, string> = {
  push: 'PUSH',
  pull: 'PULL',
  squat: 'SQUAT',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export default function HomeScreen() {
  const router = useRouter();
  const {
    status,
    user,
    categoryDoneThisWeek,
    sessions,
    getGateForCategory,
  } = useGameState();

  const { exercises } = useExercises();

  // Build a map of session dates this week keyed by day-of-week index (0=Sun)
  const weekDaySessions = useMemo(() => {
    if (!sessions || !user) return new Array(7).fill(null);

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - dayOfWeek);
    weekStartDate.setHours(0, 0, 0, 0);

    const result: (null | { category: Category; level: number })[] = new Array(7).fill(null);

    for (const s of sessions) {
      const sDate = new Date(s.date);
      if (sDate >= weekStartDate) {
        const sDay = sDate.getDay();
        result[sDay] = { category: s.category, level: s.level };
      }
    }

    return result;
  }, [sessions, user]);

  const todayIndex = new Date().getDay();

  // Count exercises per category at the user's current level
  const exerciseCountByCategory = useMemo(() => {
    const counts: Record<string, number> = { push: 0, pull: 0, squat: 0 };
    if (!user) return counts;
    for (const ex of exercises) {
      if (ex.level === user.levels[ex.category]) {
        counts[ex.category]++;
      }
    }
    return counts;
  }, [exercises, user]);

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return null;

  const remainingCats = CATEGORIES.filter(c => !categoryDoneThisWeek[c]);
  const completedCats = CATEGORIES.filter(c => categoryDoneThisWeek[c]);

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
                {/* Day label */}
                <Text style={[
                  styles.dayLabel,
                  { color: hasSession ? accent! : isToday ? colors.primary : colors.textSecondary },
                ]}>
                  {label}
                </Text>

                {/* Dot */}
                <View style={[
                  styles.dayDot,
                  {
                    backgroundColor: hasSession ? accent! : colors.surfaceLight,
                    borderWidth: isToday && !hasSession ? 1 : 0,
                    borderColor: isToday && !hasSession ? 'rgba(0,229,255,0.25)' : 'transparent',
                  },
                ]} />

                {/* Category label under dot */}
                <Text style={[
                  styles.dayCatLabel,
                  { color: hasSession ? accent! : 'transparent' },
                ]}>
                  {hasSession ? categoryLabel[session.category] : ''}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ─── REMAINING CATEGORIES ─── */}
      {remainingCats.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>REMAINING</Text>
          <View style={styles.cardList}>
            {remainingCats.map(cat => {
              const level = user.levels[cat];
              const gate = getGateForCategory(cat);
              const accent = categoryColors[cat];
              const border = categoryBorder[cat];
              const dim = categoryDim[cat];
              const exCount = exerciseCountByCategory[cat];

              return (
                <Pressable
                  key={cat}
                  onPress={() => router.push(`/log/${cat}`)}
                  style={[styles.card, { borderColor: border }]}
                >
                  <View style={styles.cardRow}>
                    {/* Left: badge + info */}
                    <View style={styles.cardLeft}>
                      <View style={[styles.levelBadge, { backgroundColor: dim, borderColor: border }]}>
                        <Text style={[styles.levelBadgeText, { color: accent }]}>L{level}</Text>
                      </View>
                      <View>
                        <Text style={styles.cardCategoryName}>{categoryLabel[cat]}</Text>
                        <Text style={styles.cardSubtext}>{exCount} exercises · ~15 min</Text>
                      </View>
                    </View>

                    {/* Right: gate progress + level + chevron */}
                    <View style={styles.cardRight}>
                      {gate && gate.consecutivePasses > 0 && (
                        <Text style={styles.gateText}>{gate.consecutivePasses}/3</Text>
                      )}
                      <Text style={[styles.cardLevelTag, { color: accent }]}>L{level}</Text>
                      <Feather name="chevron-right" size={16} color={accent} />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ─── COMPLETED CATEGORIES ─── */}
      {completedCats.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>COMPLETED</Text>
          <View style={styles.cardList}>
            {completedCats.map(cat => {
              const level = user.levels[cat];
              const accent = categoryColors[cat];

              // Find which day this session was logged
              const sessionDayIdx = weekDaySessions.findIndex(d => d?.category === cat);
              const dayName = sessionDayIdx >= 0 ? DAY_LABELS[sessionDayIdx] : '';

              return (
                <View key={cat} style={[styles.card, styles.completedCard, { borderColor: colors.border }]}>
                  <View style={styles.cardRow}>
                    {/* Left: check badge + info */}
                    <View style={styles.cardLeft}>
                      <View style={[styles.levelBadge, {
                        backgroundColor: colors.successDim,
                        borderColor: 'rgba(52,211,153,0.25)',
                      }]}>
                        <Feather name="check" size={18} color={colors.success} />
                      </View>
                      <View>
                        <Text style={styles.cardCategoryName}>{categoryLabel[cat]}</Text>
                        <Text style={styles.cardSubtext}>
                          Logged {dayName} · Level {level}
                        </Text>
                      </View>
                    </View>

                    {/* Right: level tag */}
                    <Text style={[styles.cardLevelTag, { color: accent }]}>L{level}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
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

  // ── Cards ───────────────────────────────
  cardList: {
    gap: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  completedCard: {
    opacity: 0.6,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    fontSize: 15,
    fontFamily: fonts.extraBold,
  },
  cardCategoryName: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    textTransform: 'uppercase',
  },
  cardSubtext: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gateText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.warning,
  },
  cardLevelTag: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
});
