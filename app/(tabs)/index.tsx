import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, categoryColors, categoryBorder } from '../../src/constants/theme';
import { LEVEL_NAMES } from '../../src/lib/constants';
import { useGameState, type LogSessionResult } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { CategoryBadge } from '../../src/components/ui/CategoryBadge';
import { GlowCard } from '../../src/components/ui/GlowCard';
import { ExerciseForm } from '../../src/components/ExerciseForm';
import { SessionResultView } from '../../src/components/SessionResult';
import type { Category, DraftSession } from '../../src/types';
import { CATEGORIES } from '../../src/types';

export default function HomeScreen() {
  const router = useRouter();
  const {
    status,
    user,
    categoryDoneThisWeek,
    weekComplete,
    completedThisWeek,
    streak,
    sessions,
    logSession,
    getGateForCategory,
    saveDraft: saveDraftFn,
    loadDraft,
  } = useGameState();

  const { exercises } = useExercises();

  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null);
  const [activeDraft, setActiveDraft] = useState<DraftSession | null>(null);
  const [result, setResult] = useState<LogSessionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadingCatRef = useRef<Category | null>(null);

  const handleToggleCategory = useCallback(async (category: Category) => {
    if (expandedCategory === category) {
      setExpandedCategory(null);
      setResult(null);
      setActiveDraft(null);
      return;
    }

    if (categoryDoneThisWeek[category]) return;

    loadingCatRef.current = category;
    setExpandedCategory(category);
    setResult(null);
    setSaveError(null);

    if (user) {
      const draft = await loadDraft(category, user.levels[category]);
      if (loadingCatRef.current === category) {
        setActiveDraft(draft);
      }
    }
  }, [expandedCategory, categoryDoneThisWeek, user, loadDraft]);

  const handleSave = useCallback(async (session: Parameters<typeof logSession>[0]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await logSession(session);
      setResult(res);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [logSession]);

  const handleSaveDraft = useCallback(async (draft: DraftSession) => {
    try {
      await saveDraftFn(draft);
    } catch {
      // Silent fail for draft auto-save
    }
  }, [saveDraftFn]);

  const handleDone = useCallback(() => {
    setExpandedCategory(null);
    setResult(null);
    setActiveDraft(null);
  }, []);

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return null;

  const exerciseNameMap: Record<string, string> = {};
  for (const ex of exercises) {
    exerciseNameMap[ex.id] = ex.name;
  }

  const progressPct = Math.round((completedThisWeek / 3) * 100);
  const progressColor = weekComplete ? 'emerald' : completedThisWeek > 0 ? 'cyan' : 'muted';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <Text style={styles.logoText}>contrl</Text>
        <Text style={styles.sloganText}>your body is your controller</Text>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <View style={styles.headerRight}>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>{streak}w streak</Text>
            </View>
          )}
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={styles.settingsIcon}>{'⚙'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.subtitle}>
        {completedThisWeek}/3 sessions completed
      </Text>

      <ProgressBar value={progressPct} color={progressColor} height={6} />

      {/* Week complete banner */}
      {weekComplete && !expandedCategory && (
        <View style={styles.weekCompleteBanner}>
          <Text style={styles.weekCompleteText}>All sessions done this week!</Text>
        </View>
      )}

      {/* Category cards */}
      <View style={styles.categoriesSection}>
        {CATEGORIES.map(cat => {
          const isDone = categoryDoneThisWeek[cat];
          const isExpanded = expandedCategory === cat;
          const gate = getGateForCategory(cat);
          const level = user.levels[cat];
          const levelName = LEVEL_NAMES[level] ?? `L${level}`;
          const catColor = categoryColors[cat];

          return (
            <GlowCard
              key={cat}
              glow={isExpanded ? cat : 'none'}
              style={isDone && !isExpanded ? styles.doneCard : undefined}
            >
              {/* Category header — always visible */}
              <Pressable
                onPress={() => handleToggleCategory(cat)}
                style={styles.categoryHeader}
                disabled={isDone}
              >
                <CategoryBadge category={cat} />
                <View style={styles.categoryInfo}>
                  <Text style={styles.levelText}>{levelName}</Text>
                  {gate && (
                    <Text style={styles.gateText}>
                      {gate.status === 'passed'
                        ? 'Passed'
                        : `${gate.consecutivePasses}/3`}
                    </Text>
                  )}
                </View>
                {isDone ? (
                  <Text style={[styles.checkDone, { color: catColor }]}>{'✓'}</Text>
                ) : (
                  <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                )}
              </Pressable>

              {/* Expanded content */}
              {isExpanded && !result && (
                <ExerciseForm
                  category={cat}
                  level={level}
                  exercises={exercises}
                  sessions={sessions}
                  saving={saving}
                  saveError={saveError}
                  draft={activeDraft}
                  onSave={handleSave}
                  onSaveDraft={handleSaveDraft}
                />
              )}

              {/* Session result */}
              {isExpanded && result && (
                <SessionResultView
                  result={result}
                  exerciseNames={exerciseNameMap}
                  onDone={handleDone}
                />
              )}
            </GlowCard>
          );
        })}
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
    paddingTop: 60,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 32,
    fontFamily: fonts.extraBold,
    color: colors.primary,
    letterSpacing: 6,
  },
  sloganText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 4,
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  settingsIcon: {
    fontSize: 22,
    color: colors.muted,
  },
  streakBadge: {
    backgroundColor: colors.warningDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  streakText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.warning,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 12,
  },
  weekCompleteBanner: {
    backgroundColor: colors.successDim,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  weekCompleteText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.success,
  },
  categoriesSection: {
    marginTop: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  levelText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  gateText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 12,
    color: colors.muted,
  },
  checkDone: {
    fontSize: 18,
    fontWeight: '700',
  },
  doneCard: {
    opacity: 0.5,
  },
});
