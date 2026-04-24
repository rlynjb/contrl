import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, categoryColors, categoryBorder } from '../constants/theme';
import { useGameState } from '../hooks/useGameState';
import { useExercises } from '../hooks/useExercises';
import { getNodeState } from '../lib/game/progression';
import { createGateProgress } from '../lib/game/gate-check';
import { CategoryBadge } from './ui/CategoryBadge';
import type { Category, GateProgress } from '../types';
import { CATEGORIES } from '../types';

const categoryDim: Record<Category, string> = {
  push: 'rgba(249,115,22,0.15)',
  pull: 'rgba(6,182,212,0.15)',
  squat: 'rgba(217,70,239,0.15)',
};

const LEVELS = [5, 4, 3, 2, 1]; // top-to-bottom display

type SelectedNode = {
  category: Category;
  level: number;
  status: string;
  consecutivePasses: number;
};

type Props = {
  /** Hide the PUSH/PULL/SQUAT column header row — useful when the caller renders its own headers above. */
  hideHeaders?: boolean;
  /** Hide the "SKILL TREE" section label. */
  hideSectionLabel?: boolean;
};

export function SkillTree({ hideHeaders = false, hideSectionLabel = false }: Props = {}) {
  const { user, gateProgress, sessions } = useGameState();
  const { exercises } = useExercises();
  const router = useRouter();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  // Sessions-this-week count per category — drives the "Done" indicator on the
  // active-level workout card.
  const weekSessionCount = useMemo(() => {
    const counts: Record<Category, number> = { push: 0, pull: 0, squat: 0 };
    if (!sessions.length) return counts;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    for (const s of sessions) {
      if (new Date(s.date) >= weekStart) counts[s.category]++;
    }
    return counts;
  }, [sessions]);

  if (!user) return null;

  const getGate = (cat: Category, level: number): GateProgress => {
    const key = `${cat}:${level}`;
    return gateProgress[key] ?? createGateProgress(cat, level, user.levels[cat]);
  };

  const handleNodePress = (cat: Category, level: number) => {
    const gate = getGate(cat, level);
    const nodeState = getNodeState(gate, user.levels);
    setSelectedNode({
      category: cat,
      level,
      status: nodeState,
      consecutivePasses: gate.consecutivePasses,
    });
  };

  const modalExercises = selectedNode
    ? exercises.filter(
        e => e.category === selectedNode.category && e.level === selectedNode.level
      )
    : [];

  return (
    <View>
      {!hideSectionLabel && <Text style={styles.sectionHeader}>SKILL TREE</Text>}

      {/* Category column headers */}
      {!hideHeaders && (
        <View style={styles.headerRow}>
          {CATEGORIES.map(cat => (
            <View key={cat} style={styles.headerCol}>
              <Text
                style={[
                  styles.headerCat,
                  { color: categoryColors[cat] },
                ]}
              >
                {cat.toUpperCase()}
              </Text>
              <Text style={styles.headerLevel}>L{user.levels[cat]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Grid */}
      {LEVELS.map((level, rowIndex) => (
        <View key={level} style={styles.gridRow}>
          {CATEGORIES.map(cat => {
            const gate = getGate(cat, level);
            const nodeState = getNodeState(gate, user.levels);
            const catColor = categoryColors[cat];
            const catBorder = categoryBorder[cat];
            const isPassed = nodeState === 'passed';
            const isLocked = nodeState === 'locked';
            const isInProgress =
              nodeState === 'in-progress' && gate.consecutivePasses > 0;
            const levelExercises = exercises.filter(
              e => e.category === cat && e.level === level
            );
            const hasExercises = levelExercises.length > 0;
            const isActive = level === user.levels[cat];
            const doneCount = isActive ? weekSessionCount[cat] : 0;
            const isDone = doneCount > 0;

            return (
              <View key={cat} style={styles.gridCell}>
                {/* Connector line */}
                {rowIndex > 0 && (
                  <View
                    style={[
                      styles.connector,
                      {
                        backgroundColor:
                          isPassed || nodeState === 'in-progress'
                            ? `${catColor}30`
                            : colors.border,
                      },
                    ]}
                  />
                )}

                {isActive ? (
                  /* Active (user's current level) node rendered as a workout card.
                     Tap routes directly to the log screen. */
                  <Pressable
                    onPress={() => router.push(`/log/${cat}`)}
                    style={[
                      styles.activeCard,
                      { borderColor: isDone ? 'rgba(52,211,153,0.25)' : catBorder },
                    ]}
                  >
                    <View
                      style={[
                        styles.activeBadge,
                        isDone
                          ? { backgroundColor: colors.successDim, borderColor: 'rgba(52,211,153,0.25)' }
                          : { backgroundColor: categoryDim[cat], borderColor: catBorder },
                      ]}
                    >
                      {isDone ? (
                        <Feather name="check" size={16} color={colors.success} />
                      ) : (
                        <Text style={[styles.activeBadgeText, { color: catColor }]}>L{level}</Text>
                      )}
                    </View>
                    <Text style={[styles.activeCatName, { color: catColor }]}>
                      {cat.toUpperCase()}
                    </Text>
                    <Text style={styles.activeSubtext}>
                      {isDone
                        ? `Done${doneCount > 1 ? ` ${doneCount}×` : ''}`
                        : `${levelExercises.length} exercises`}
                    </Text>
                    {gate.consecutivePasses > 0 && (
                      <View style={styles.activeGateGroup}>
                        <Text style={[styles.activeGateText, { color: catColor }]}>
                          {gate.consecutivePasses}/3
                        </Text>
                        <Text style={styles.activeGateCaption}>
                          clean streak
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <>
                    {/* Non-active node (passed / locked / future in-progress) */}
                    <Pressable
                      onPress={() =>
                        hasExercises
                          ? handleNodePress(cat, level)
                          : null
                      }
                      style={[
                        styles.node,
                        {
                          borderColor: isPassed
                            ? catColor
                            : isLocked
                              ? colors.border
                              : `${catColor}60`,
                          backgroundColor: isPassed
                            ? `${catColor}18`
                            : isLocked
                              ? 'rgba(30,41,59,0.5)'
                              : `${catColor}0a`,
                          opacity: isLocked ? 0.35 : 1,
                        },
                      ]}
                    >
                      {isPassed ? (
                        <Feather name="check" size={20} color={catColor} />
                      ) : isLocked ? (
                        <Feather name="lock" size={14} color={colors.textSecondary} />
                      ) : (
                        <Text
                          style={[
                            styles.nodeLevel,
                            { color: catColor },
                          ]}
                        >
                          {level}
                        </Text>
                      )}

                      {/* In-progress badge */}
                      {isInProgress && (
                        <View
                          style={[
                            styles.progressBadge,
                            { borderColor: `${catColor}40` },
                          ]}
                        >
                          <Text style={[styles.progressBadgeText, { color: catColor }]}>
                            {gate.consecutivePasses}/3
                          </Text>
                        </View>
                      )}
                    </Pressable>

                    {/* Exercise count + level label */}
                    <Text
                      style={[
                        styles.nodeLevelLabel,
                        { marginTop: isInProgress ? 6 : 2 },
                      ]}
                    >
                      L{level} · {levelExercises.length}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Node detail modal */}
      <Modal
        visible={selectedNode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedNode(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedNode(null)}>
          <Pressable
            style={[
              styles.modalContent,
              selectedNode
                ? { borderColor: categoryBorder[selectedNode.category] }
                : undefined,
            ]}
            onPress={e => e.stopPropagation()}
          >
            {selectedNode && (
              <>
                {/* Header row */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderLeft}>
                    <CategoryBadge category={selectedNode.category} size="sm" />
                    <Text style={styles.modalTitle}>
                      Level {selectedNode.level}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.modalStatus,
                      {
                        color:
                          selectedNode.status === 'passed'
                            ? colors.success
                            : selectedNode.status === 'locked'
                              ? colors.textSecondary
                              : categoryColors[selectedNode.category],
                      },
                    ]}
                  >
                    {selectedNode.status === 'passed'
                      ? 'PASSED'
                      : selectedNode.status === 'locked'
                        ? 'LOCKED'
                        : `${selectedNode.consecutivePasses}/3`}
                  </Text>
                </View>

                {/* 3-segment progress bar */}
                <View style={styles.progressBar}>
                  {[0, 1, 2].map(i => (
                    <View
                      key={i}
                      style={[
                        styles.progressSegment,
                        {
                          backgroundColor:
                            i < selectedNode.consecutivePasses
                              ? categoryColors[selectedNode.category]
                              : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>

                {/* Exercises label */}
                <Text style={styles.exercisesLabel}>EXERCISES</Text>

                {/* Exercises list */}
                {modalExercises.map((ex, i) => (
                  <View key={ex.id ?? i} style={styles.exerciseRow}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <Text style={styles.exerciseTarget}>
                      {ex.isHold
                        ? `${ex.targetSets}x${ex.targetReps}s`
                        : `${ex.targetSets}x${ex.targetReps}`}
                    </Text>
                  </View>
                ))}

                {/* Close button */}
                <Pressable
                  style={styles.closeButton}
                  onPress={() => setSelectedNode(null)}
                >
                  <Feather name="x" size={12} color={colors.textSecondary} />
                  <Text style={styles.closeButtonText}>CLOSE</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  headerCol: {
    alignItems: 'center',
  },
  headerCat: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.32,
  },
  headerLevel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  connector: {
    width: 2,
    height: 10,
  },
  node: {
    width: 48,
    height: 48,
    borderRadius: 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLevel: {
    fontSize: 15,
    fontFamily: fonts.extraBold,
  },
  progressBadge: {
    position: 'absolute',
    bottom: -7,
    backgroundColor: colors.bg,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 0,
    borderWidth: 1,
  },
  progressBadgeText: {
    fontSize: 8,
    fontFamily: fonts.bold,
  },
  nodeLevelLabel: {
    fontSize: 8,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  // Active-level workout card (rendered in-grid at user's current level)
  activeCard: {
    width: '92%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  activeBadge: {
    width: 32,
    height: 32,
    borderRadius: 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  activeBadgeText: {
    fontSize: 13,
    fontFamily: fonts.extraBold,
  },
  activeCatName: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1,
  },
  activeSubtext: {
    fontSize: 9,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  activeGateGroup: {
    alignItems: 'center',
    marginTop: 2,
  },
  activeGateText: {
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  activeGateCaption: {
    fontSize: 7,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  // Modal
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
    borderRadius: 0,
    maxWidth: 340,
    width: '100%',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: fonts.extraBold,
    color: colors.text,
  },
  modalStatus: {
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 0,
  },
  exercisesLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseName: {
    fontSize: 13,
    color: colors.text,
  },
  exerciseTarget: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  closeButton: {
    marginTop: 14,
    width: '100%',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  closeButtonText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
});
