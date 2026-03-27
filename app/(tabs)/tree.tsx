import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, categoryColors, categoryBorder } from '../../src/constants/theme';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { getNodeState } from '../../src/lib/game/progression';
import { createGateProgress } from '../../src/lib/game/gate-check';
import { CategoryBadge } from '../../src/components/ui/CategoryBadge';
import type { Category, GateProgress } from '../../src/types';
import { CATEGORIES } from '../../src/types';

const LEVELS = [5, 4, 3, 2, 1]; // top-to-bottom display

type SelectedNode = {
  category: Category;
  level: number;
  status: string;
  consecutivePasses: number;
};

export default function TreeScreen() {
  const { status, user, gateProgress } = useGameState();
  const { exercises } = useExercises();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return null;

  const getGate = (cat: Category, level: number): GateProgress => {
    const key = `${cat}:${level}`;
    return gateProgress[key] ?? createGateProgress(cat, level, user.levels[cat]);
  };

  const handleNodePress = (cat: Category, level: number) => {
    const gate = getGate(cat, level);
    const nodeState = getNodeState(gate, user.levels);
    if (nodeState === 'locked') return;
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Section header */}
      <Text style={styles.sectionLabel}>SKILL TREE</Text>
      <Text style={styles.title}>Your Progress</Text>

      {/* Category column headers */}
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

      {/* Grid */}
      {LEVELS.map((level, rowIndex) => (
        <View key={level} style={styles.gridRow}>
          {CATEGORIES.map(cat => {
            const gate = getGate(cat, level);
            const nodeState = getNodeState(gate, user.levels);
            const catColor = categoryColors[cat];
            const isPassed = nodeState === 'passed';
            const isLocked = nodeState === 'locked';
            const isInProgress =
              nodeState === 'in-progress' && gate.consecutivePasses > 0;
            const levelExercises = exercises.filter(
              e => e.category === cat && e.level === level
            );
            const hasExercises = levelExercises.length > 0;

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

                {/* Node */}
                <Pressable
                  onPress={() =>
                    hasExercises && !isLocked
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

                {/* Level label */}
                <Text
                  style={[
                    styles.nodeLevelLabel,
                    { marginTop: isInProgress ? 6 : 2 },
                  ]}
                >
                  L{level}
                </Text>
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
                            : categoryColors[selectedNode.category],
                      },
                    ]}
                  >
                    {selectedNode.status === 'passed'
                      ? 'PASSED'
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
    paddingTop: 60,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    letterSpacing: 1.65,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
    color: colors.text,
    marginBottom: 20,
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
