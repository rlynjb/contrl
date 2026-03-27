import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, categoryColors, fonts } from '@/constants/theme';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SetCameraOverlay } from '@/components/camera/SetCameraOverlay';
import { useExerciseForm } from '@/hooks/useExerciseForm';
import { useGameState } from '@/hooks/useGameState';
import type { LogSessionResult } from '@/hooks/useGameState';
import * as database from '@/services/database';
import type {
  Category,
  Exercise,
  ExerciseBreakdown,
  WorkoutSession,
  DraftSession,
} from '@/types';

// ── Result types ──────────────────────────────────────────────

type ResultData = {
  passed: boolean;
  overallPercentage: number;
  consecutiveAfter: number;
  gatePassed: boolean;
  exercises: ExerciseBreakdown[];
};

// ── Motivational message helper ───────────────────────────────

function getMessage(pct: number, clean: boolean, gatePassed: boolean): string {
  if (gatePassed) return 'You own this level.';
  if (clean) return 'Clean session — keep this up.';
  if (pct >= 90) return 'Almost there — so close to a clean session.';
  if (pct >= 75) return 'Solid work — a few more reps and you\'ve got it.';
  if (pct >= 50) return 'Good effort — you\'re building toward it.';
  return 'Every rep counts — keep showing up.';
}

// ── Main component ──────────────────────────────────────────

export default function LogScreen() {
  const { category: rawCategory } = useLocalSearchParams<{ category: string }>();
  const category = (rawCategory ?? 'push') as Category;
  const catColor = categoryColors[category];

  const {
    status,
    user,
    sessions,
    logSession,
    getGateForCategory,
    saveDraft,
    loadDraft,
  } = useGameState();

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const [phase, setPhase] = useState<'form' | 'result'>('form');
  const [result, setResult] = useState<ResultData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    exIdx: number;
    setIdx: number;
  } | null>(null);

  const level = user?.levels[category] ?? 1;

  // Load exercises and draft
  useEffect(() => {
    if (status !== 'ready') return;
    (async () => {
      const exs = await database.getExercises();
      setAllExercises(exs);
      const d = await loadDraft(category, level);
      setDraft(d);
    })();
  }, [status, category, level, loadDraft]);

  const {
    levelExercises,
    lastSession,
    exerciseState,
    notes,
    setNotes,
    toggleSet,
    updateValue,
    buildSession,
  } = useExerciseForm({
    category,
    level,
    exercises: allExercises,
    sessions,
    draft,
    onSaveDraft: saveDraft,
  });

  // ── Set status helpers ──────────────────────────────────────

  const getSetStatus = (exIdx: number, setIdx: number): 'pending' | 'hit' | 'miss' => {
    const state = exerciseState[exIdx];
    if (!state) return 'pending';
    const checked = state.checkedSets[setIdx];
    if (!checked) return 'pending';
    const ex = levelExercises[exIdx];
    const targetVal = ex.targetReps;
    const actualVal = ex.isHold
      ? (state.actualHoldSeconds?.[setIdx] ?? 0)
      : state.actualReps[setIdx];
    return actualVal >= targetVal ? 'hit' : 'miss';
  };

  const getExProgress = (exIdx: number) => {
    const state = exerciseState[exIdx];
    const ex = levelExercises[exIdx];
    if (!state || !ex) return { done: 0, total: 0, allHit: false };
    const targetVal = ex.targetReps;
    let done = 0;
    for (let i = 0; i < ex.targetSets; i++) {
      if (!state.checkedSets[i]) continue;
      const actualVal = ex.isHold
        ? (state.actualHoldSeconds?.[i] ?? 0)
        : state.actualReps[i];
      if (actualVal >= targetVal) done++;
    }
    return { done, total: ex.targetSets, allHit: done === ex.targetSets };
  };

  // ── Save handler ────────────────────────────────────────────

  const hasAnyCheckedSets = exerciseState.some(s => s.checkedSets.some(Boolean));

  const handleSave = useCallback(async () => {
    if (saving || levelExercises.length === 0) return;
    if (!hasAnyCheckedSets) {
      setSaveError('Check at least one set before saving.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      const session = buildSession();
      const logResult: LogSessionResult = await logSession(session);

      const { sessionResult, gateProgress: gate } = logResult;

      // Build per-exercise breakdown
      const breakdowns: ExerciseBreakdown[] = levelExercises.map((ex, i) => {
        const state = exerciseState[i];
        const targetVal = ex.targetReps;
        let earned = 0;
        const total = targetVal * ex.targetSets;
        let allHit = true;

        const shortSets: ExerciseBreakdown['shortSets'] = [];

        for (let s = 0; s < ex.targetSets; s++) {
          const checked = state.checkedSets[s] ?? false;
          const actual = ex.isHold
            ? (state.actualHoldSeconds?.[s] ?? 0)
            : state.actualReps[s];

          if (checked) {
            earned += Math.min(actual, targetVal);
            if (actual < targetVal) {
              allHit = false;
              shortSets.push({ set: s + 1, type: 'short', got: actual, needed: targetVal });
            }
          } else {
            allHit = false;
            shortSets.push({ set: s + 1, type: 'unchecked' });
          }
        }

        if (state.checkedSets.filter(Boolean).length < ex.targetSets) {
          allHit = false;
        }

        return {
          exerciseId: ex.id,
          name: ex.name,
          hit: allHit,
          percentage: total > 0 ? Math.round((earned / total) * 100) : 0,
          isHold: ex.isHold,
          shortSets,
        };
      });

      const passed = sessionResult.isClean;

      setResult({
        passed,
        overallPercentage: sessionResult.completionPct,
        consecutiveAfter: Math.min(gate.consecutivePasses, 3),
        gatePassed: gate.status === 'passed',
        exercises: breakdowns,
      });
      setPhase('result');
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save session');
    } finally {
      setSaving(false);
    }
  }, [saving, levelExercises, exerciseState, buildSession, logSession]);

  // ── Camera handler ──────────────────────────────────────────

  const handleCameraComplete = (value: number) => {
    if (!cameraTarget) return;
    const { exIdx, setIdx } = cameraTarget;
    const ex = levelExercises[exIdx];
    updateValue(exIdx, setIdx, value, ex.isHold);
    toggleSet(exIdx, setIdx);
    setCameraTarget(null);
  };

  // ── Loading state ───────────────────────────────────────────

  if (status === 'loading' || allExercises.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // ── Result view ─────────────────────────────────────────────

  if (phase === 'result' && result) {
    const headerColor = result.gatePassed
      ? colors.success
      : result.passed
        ? colors.primary
        : colors.warning;

    const headerTitle = result.gatePassed
      ? 'GATE PASSED'
      : result.passed
        ? 'ALL TARGETS HIT'
        : 'SESSION LOGGED';

    const barColor: 'emerald' | 'cyan' | 'amber' = result.gatePassed
      ? 'emerald'
      : result.passed
        ? 'cyan'
        : 'amber';

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={14} color={colors.textSecondary} />
          <Text style={styles.backText}>Home</Text>
        </Pressable>

        {/* Result card */}
        <View
          style={[
            styles.resultCard,
            {
              backgroundColor: result.gatePassed
                ? 'rgba(52,211,153,0.06)'
                : colors.surface,
              borderColor: result.gatePassed
                ? colors.success + '40'
                : result.passed
                  ? colors.primary + '25'
                  : colors.warning + '20',
            },
          ]}
        >
          <Text style={[styles.resultTitle, { color: headerColor }]}>
            {headerTitle}
          </Text>

          <View style={styles.resultBadgeRow}>
            <CategoryBadge category={category} size="sm" />
            <Text style={styles.resultLevelText}>LEVEL {level}</Text>
          </View>

          <Text style={[styles.resultPercentage, { color: headerColor }]}>
            {result.overallPercentage}%
          </Text>
          <Text style={styles.resultSubLabel}>overall completion</Text>

          <View style={styles.resultProgressContainer}>
            <ProgressBar
              value={result.overallPercentage}
              color={barColor}
              height={5}
            />
          </View>

          <Text style={styles.resultMessage}>
            {getMessage(result.overallPercentage, result.passed, result.gatePassed)}
          </Text>

          {result.gatePassed ? (
            <Text style={styles.gatePassedText}>
              3/3 {'\u00B7'} {category.toUpperCase()} {'\u2192'} L{level + 1}
            </Text>
          ) : (
            <View
              style={[
                styles.consecutiveBadge,
                {
                  backgroundColor: result.passed
                    ? colors.primaryDim
                    : colors.warningDim,
                },
              ]}
            >
              <Text
                style={[
                  styles.consecutiveNumber,
                  {
                    color: result.passed ? colors.primary : colors.warning,
                  },
                ]}
              >
                {result.consecutiveAfter}/3
              </Text>
              <Text style={styles.consecutiveLabel}>
                {result.passed ? 'toward gate' : 'clean sessions needed'}
              </Text>
            </View>
          )}
        </View>

        {/* Exercise breakdown */}
        <Text style={styles.breakdownHeader}>EXERCISE BREAKDOWN</Text>

        {result.exercises.map((ex, i) => (
          <View key={i} style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownName}>{ex.name}</Text>
              <Text
                style={[
                  styles.breakdownPct,
                  { color: ex.hit ? colors.success : colors.warning },
                ]}
              >
                {ex.percentage}%
              </Text>
            </View>

            <ProgressBar
              value={ex.percentage}
              color={ex.hit ? 'emerald' : 'amber'}
              height={4}
            />

            {!ex.hit && ex.shortSets.length > 0 && (
              <View style={styles.shortSetsContainer}>
                {ex.shortSets.map((s, j) => (
                  <Text
                    key={j}
                    style={[
                      styles.shortSetText,
                      {
                        color:
                          s.type === 'unchecked'
                            ? colors.textSecondary
                            : colors.warning,
                      },
                    ]}
                  >
                    {s.type === 'unchecked'
                      ? `Set ${s.set}: not logged`
                      : `Set ${s.set}: ${s.got}${ex.isHold ? 's' : ''} \u2192 ${(s.needed ?? 0) - (s.got ?? 0)} ${ex.isHold ? 'sec' : 'rep'}${(s.needed ?? 0) - (s.got ?? 0) !== 1 ? 's' : ''} to go`}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Back to home button */}
        <Pressable onPress={() => router.back()} style={styles.backToHomeButton}>
          <Text style={styles.backToHomeText}>BACK TO HOME</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Form view ───────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={14} color={colors.textSecondary} />
          <Text style={styles.backText}>Home</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <CategoryBadge category={category} size="sm" />
          <Text style={styles.headerLevel}>LEVEL {level}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>Log Workout</Text>

      {/* Exercise blocks */}
      {levelExercises.map((ex, exIdx) => {
        const state = exerciseState[exIdx];
        if (!state) return null;

        const prog = getExProgress(exIdx);
        const targetVal = ex.targetReps;
        const targetDisplay = ex.isHold
          ? `${ex.targetSets}\u00D7${ex.targetReps}s`
          : `${ex.targetSets}\u00D7${ex.targetReps}`;
        const tempo = ex.tempo ?? (ex.isHold ? 'Steady' : '2-1-2-0');

        return (
          <View key={ex.id} style={styles.exerciseBlock}>
            {/* Exercise header */}
            <View style={styles.exerciseHeaderRow}>
              <View style={styles.exerciseHeaderLeft}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <View style={styles.exerciseMetaRow}>
                  <Text style={styles.exerciseMetaText}>
                    {ex.isHold ? 'Hold' : 'Reps'}
                  </Text>
                  <Text style={styles.exerciseMetaSep}>|</Text>
                  <Text style={styles.exerciseMetaText}>{tempo}</Text>
                </View>
              </View>
              <View style={styles.exerciseHeaderRight}>
                <Text style={[styles.exerciseTarget, { color: catColor }]}>
                  {targetDisplay}
                </Text>
                <Text
                  style={[
                    styles.exerciseSetsCount,
                    prog.allHit && { color: colors.success },
                  ]}
                >
                  {prog.done}/{prog.total} sets
                </Text>
              </View>
            </View>

            {/* Per-set progress bar segments */}
            <View style={styles.setProgressBar}>
              {Array.from({ length: ex.targetSets }, (_, i) => {
                const st = getSetStatus(exIdx, i);
                return (
                  <View
                    key={i}
                    style={[
                      styles.setProgressSegment,
                      {
                        backgroundColor:
                          st === 'hit'
                            ? colors.success
                            : st === 'miss'
                              ? colors.muted
                              : colors.border,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Set rows */}
            {Array.from({ length: ex.targetSets }, (_, setIdx) => {
              const checked = state.checkedSets[setIdx] ?? false;
              const st = getSetStatus(exIdx, setIdx);
              const currentVal = ex.isHold
                ? (state.actualHoldSeconds?.[setIdx] ?? 0)
                : state.actualReps[setIdx];

              const lastEntry = lastSession?.exercises.find(
                (e) => e.exerciseId === ex.id
              );
              const lastVal = ex.isHold
                ? lastEntry?.actualHoldSeconds?.[setIdx]
                : lastEntry?.actualReps[setIdx];

              return (
                <View
                  key={setIdx}
                  style={[
                    styles.setRow,
                    {
                      backgroundColor: checked
                        ? st === 'hit'
                          ? 'rgba(52,211,153,0.06)'
                          : colors.mutedDim
                        : colors.surfaceLight,
                      borderColor: checked
                        ? st === 'hit'
                          ? colors.success + '30'
                          : colors.muted + '30'
                        : colors.border,
                    },
                  ]}
                >
                  {/* Checkbox */}
                  <Pressable
                    onPress={() => toggleSet(exIdx, setIdx)}
                    style={[
                      styles.checkbox,
                      checked && {
                        backgroundColor:
                          st === 'hit' ? colors.success : colors.muted,
                        borderColor:
                          st === 'hit' ? colors.success : colors.muted,
                      },
                    ]}
                  >
                    {checked && (
                      <Feather
                        name={st === 'hit' ? 'check' : 'minus'}
                        size={14}
                        color={colors.bg}
                      />
                    )}
                  </Pressable>

                  {/* Set label */}
                  <View style={styles.setLabelContainer}>
                    <Text style={styles.setLabel}>SET {setIdx + 1}</Text>
                  </View>

                  {/* Value input */}
                  <TextInput
                    style={styles.valueInput}
                    value={currentVal ? String(currentVal) : ''}
                    onChangeText={(t) => {
                      const num = parseInt(t, 10);
                      if (!isNaN(num) && num >= 0) {
                        updateValue(exIdx, setIdx, num, ex.isHold);
                      } else if (t === '') {
                        updateValue(exIdx, setIdx, 0, ex.isHold);
                      }
                    }}
                    placeholder={String(targetVal)}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />

                  {/* Camera button */}
                  <Pressable
                    onPress={() => setCameraTarget({ exIdx, setIdx })}
                    style={styles.cameraButton}
                  >
                    <Feather name="camera" size={13} color={colors.primary} />
                  </Pressable>

                  {/* Target + last value */}
                  <View style={styles.setRightInfo}>
                    <Text style={[styles.setTargetText, { color: catColor }]}>
                      / {targetVal}
                      {ex.isHold ? 's' : ''}
                    </Text>
                    {lastVal !== undefined && (
                      <Text style={styles.setLastText}>
                        last: {lastVal}
                        {ex.isHold ? 's' : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Progression guide toggle */}
            {ex.notes && (
              <View style={styles.guideContainer}>
                <Pressable
                  onPress={() =>
                    setExpandedGuide(
                      expandedGuide === ex.id ? null : ex.id
                    )
                  }
                  style={styles.guideToggle}
                >
                  <Feather
                    name="chevron-right"
                    size={12}
                    color={colors.textSecondary}
                    style={{
                      transform: [
                        {
                          rotate:
                            expandedGuide === ex.id ? '90deg' : '0deg',
                        },
                      ],
                    }}
                  />
                  <Text style={styles.guideToggleText}>
                    Progression guide
                  </Text>
                </Pressable>

                {expandedGuide === ex.id && (
                  <View style={styles.guideContent}>
                    {ex.notes.split('\n').map((line, li) => {
                      const tipMatch = line.match(/^Tip:\s*(.+)/);
                      const nextMatch = line.match(/^Next:\s*(.+)/);
                      const scaleMatch = line.match(/^Scale down:\s*(.+)/);

                      if (tipMatch) {
                        return (
                          <View key={li} style={styles.guideRow}>
                            <Feather name="zap" size={14} color={colors.warning} style={styles.guideIcon} />
                            <Text style={styles.guideTipText}>{tipMatch[1]}</Text>
                          </View>
                        );
                      }
                      if (scaleMatch) {
                        return (
                          <View key={li} style={styles.guideRow}>
                            <Feather name="arrow-down-right" size={14} color={colors.muted} style={styles.guideIcon} />
                            <Text style={styles.guideLabel}>Scale down:</Text>
                            <Text style={styles.guideRegressText}>{scaleMatch[1]}</Text>
                          </View>
                        );
                      }
                      if (nextMatch) {
                        return (
                          <View key={li} style={styles.guideRow}>
                            <Feather name="arrow-up-right" size={14} color={colors.success} style={styles.guideIcon} />
                            <Text style={styles.guideLabel}>Next:</Text>
                            <Text style={styles.guideNextText}>{nextMatch[1]}</Text>
                          </View>
                        );
                      }
                      if (line.trim()) {
                        return (
                          <View key={li} style={styles.guideRow}>
                            <Text style={styles.guideTipText}>{line}</Text>
                          </View>
                        );
                      }
                      return null;
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* Notes textarea */}
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes (optional)"
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={2}
      />

      {/* Save error */}
      {saveError && <Text style={styles.errorText}>{saveError}</Text>}

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        disabled={saving || !hasAnyCheckedSets}
        style={[
          styles.saveButton,
          {
            borderColor: catColor + '30',
            backgroundColor: catColor + '15',
            opacity: hasAnyCheckedSets ? 1 : 0.4,
          },
        ]}
      >
        <Text style={[styles.saveButtonText, { color: catColor }]}>
          {saving ? 'SAVING...' : 'SAVE SESSION'}
        </Text>
      </Pressable>

      {/* Camera overlay */}
      {cameraTarget && (
        <SetCameraOverlay
          category={category}
          exercise={levelExercises[cameraTarget.exIdx]}
          setIndex={cameraTarget.setIdx}
          targetValue={levelExercises[cameraTarget.exIdx].targetReps}
          onComplete={handleCameraComplete}
          onClose={() => setCameraTarget(null)}
        />
      )}
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 16,
  },
  backText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLevel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },

  // ── Title ─────────────────────────────────────────────────
  title: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
    color: colors.text,
    marginBottom: 20,
  },

  // ── Exercise block ────────────────────────────────────────
  exerciseBlock: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  exerciseHeaderLeft: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  exerciseMetaText: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  exerciseMetaSep: {
    fontSize: 10,
    color: colors.border,
  },
  exerciseHeaderRight: {
    alignItems: 'flex-end',
  },
  exerciseTarget: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    lineHeight: 22,
  },
  exerciseSetsCount: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // ── Set progress bar ──────────────────────────────────────
  setProgressBar: {
    flexDirection: 'row',
    gap: 3,
    marginVertical: 8,
  },
  setProgressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },

  // ── Set row ───────────────────────────────────────────────
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1,
    marginBottom: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setLabelContainer: {
    width: 34,
  },
  setLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  valueInput: {
    flex: 1,
    backgroundColor: 'rgba(6,8,15,0.5)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  cameraButton: {
    width: 28,
    height: 28,
    borderRadius: 2,
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setRightInfo: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  setTargetText: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  setLastText: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // ── Progression guide ─────────────────────────────────────
  guideContainer: {
    marginTop: 8,
  },
  guideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  guideToggleText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  guideContent: {
    gap: 2,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  guideIcon: {
    flexShrink: 0,
  },
  guideTipText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    flex: 1,
  },
  guideLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  guideRegressText: {
    fontSize: 13,
    color: colors.muted,
  },
  guideNextText: {
    fontSize: 13,
    color: colors.success,
  },

  // ── Notes ─────────────────────────────────────────────────
  notesInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 12,
    fontFamily: fonts.regular,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: 16,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 8,
  },

  // ── Save button ───────────────────────────────────────────
  saveButton: {
    marginTop: 16,
    borderRadius: 2,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
  },

  // ── Result view ───────────────────────────────────────────
  resultCard: {
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
    marginBottom: 6,
  },
  resultBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  resultLevelText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  resultPercentage: {
    fontSize: 40,
    fontFamily: fonts.extraBold,
    lineHeight: 44,
  },
  resultSubLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 10,
  },
  resultProgressContainer: {
    width: 180,
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  gatePassedText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.success,
    marginTop: 10,
  },
  consecutiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 2,
    marginTop: 10,
  },
  consecutiveNumber: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
  },
  consecutiveLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },

  // ── Breakdown ─────────────────────────────────────────────
  breakdownHeader: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownName: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  breakdownPct: {
    fontSize: 13,
    fontFamily: fonts.extraBold,
  },
  shortSetsContainer: {
    marginTop: 8,
  },
  shortSetText: {
    fontSize: 11,
    fontFamily: fonts.regular,
  },

  // ── Back to home ──────────────────────────────────────────
  backToHomeButton: {
    marginTop: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    backgroundColor: colors.primaryDim,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backToHomeText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
});
