import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, categoryColors } from '../../src/constants/theme';
import { LEVEL_NAMES } from '../../src/lib/constants';
import { useGameState } from '../../src/hooks/useGameState';
import { useExercises } from '../../src/hooks/useExercises';
import { getNodeState } from '../../src/lib/game/progression';
import { createGateProgress } from '../../src/lib/game/gate-check';
import { CategoryBadge } from '../../src/components/ui/CategoryBadge';
import type { Category, GateProgress } from '../../src/types';
import { CATEGORIES } from '../../src/types';

const LEVELS = [5, 4, 3, 2, 1]; // top-to-bottom display

const NODE_COLORS = {
  locked: colors.muted,
  open: colors.textSecondary,
  'in-progress': colors.primary,
  passed: colors.success,
} as const;

export default function TreeScreen() {
  const { status, user, gateProgress } = useGameState();
  const { exercises } = useExercises();
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

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
    const key = `${cat}:${level}`;
    setExpandedNode(prev => prev === key ? null : key);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Skill Tree</Text>

      {/* Column headers */}
      <View style={styles.headerRow}>
        {CATEGORIES.map(cat => (
          <View key={cat} style={styles.headerCol}>
            <CategoryBadge category={cat} size="sm" />
            <Text style={[styles.headerLevel, { color: categoryColors[cat] }]}>
              L{user.levels[cat]}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      {LEVELS.map(level => {
        const levelName = LEVEL_NAMES[level] ?? `L${level}`;
        return (
          <View key={level}>
            {/* Level label */}
            <Text style={styles.levelLabel}>{levelName}</Text>

            <View style={styles.gridRow}>
              {CATEGORIES.map(cat => {
                const gate = getGate(cat, level);
                const nodeState = getNodeState(gate, user.levels);
                const nodeColor = NODE_COLORS[nodeState];
                const isExpanded = expandedNode === `${cat}:${level}`;
                const catColor = categoryColors[cat];
                const levelExercises = exercises.filter(
                  e => e.category === cat && e.level === level
                );
                const hasExercises = levelExercises.length > 0;

                return (
                  <View key={cat} style={styles.gridCell}>
                    <Pressable
                      onPress={() => hasExercises ? handleNodePress(cat, level) : null}
                      style={[
                        styles.node,
                        {
                          borderColor: isExpanded ? catColor : nodeColor,
                          backgroundColor: nodeState === 'passed'
                            ? `${catColor}15`
                            : colors.surface,
                        },
                        !hasExercises && styles.nodeEmpty,
                      ]}
                    >
                      <Text style={[styles.nodeLevel, { color: nodeColor }]}>
                        {level}
                      </Text>
                      {nodeState === 'in-progress' && (
                        <Text style={styles.nodeCounter}>
                          {gate.consecutivePasses}/3
                        </Text>
                      )}
                      {nodeState === 'passed' && (
                        <Feather name="check" size={14} color={catColor} />
                      )}
                      {nodeState === 'locked' && (
                        <Feather name="lock" size={12} color={colors.muted} />
                      )}
                    </Pressable>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <View style={[styles.nodeDetail, { borderColor: `${catColor}30` }]}>
                        <Text style={styles.detailTitle}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)} L{level}
                        </Text>
                        <Text style={styles.detailStatus}>
                          {nodeState === 'passed'
                            ? 'Completed'
                            : nodeState === 'locked'
                              ? 'Locked'
                              : `${gate.consecutivePasses}/3 clean sessions`}
                        </Text>
                        {levelExercises.map(ex => (
                          <View key={ex.id} style={styles.detailExercise}>
                            <Text style={styles.detailExName}>{ex.name}</Text>
                            <Text style={styles.detailExTarget}>
                              {ex.isHold
                                ? `${ex.targetSets}x${ex.targetHoldSeconds}s`
                                : `${ex.targetSets}x${ex.targetReps}`}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
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
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  headerCol: {
    alignItems: 'center',
    gap: 4,
  },
  headerLevel: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  levelLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
  },
  node: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeEmpty: {
    opacity: 0.3,
  },
  nodeLevel: {
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  nodeCounter: {
    fontSize: 10,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  nodeCheck: {
    fontSize: 12,
    fontWeight: '700',
  },
  nodeLock: {
    fontSize: 10,
  },
  nodeDetail: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
    width: 120,
  },
  detailTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 4,
  },
  detailStatus: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
  },
  detailExercise: {
    marginBottom: 4,
  },
  detailExName: {
    fontSize: 11,
    color: colors.text,
  },
  detailExTarget: {
    fontSize: 10,
    color: colors.muted,
  },
});
