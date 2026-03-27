import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getGapText, getCompletionMessage } from '@/lib/session-helpers';
import type { LogSessionResult } from '@/hooks/useGameState';

type SessionResultProps = {
  result: LogSessionResult;
  exerciseNames: Record<string, string>;
  onDone: () => void;
};

export function SessionResultView({ result, exerciseNames, onDone }: SessionResultProps) {
  const { sessionResult, gateProgress, leveledUp, newLevel } = result;
  const pct = sessionResult.completionPct;

  const barColor = pct === 100 ? 'emerald' : pct >= 75 ? 'cyan' : 'amber';

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.headerLabel}>SESSION LOGGED</Text>
      <Text style={styles.pct}>{pct}%</Text>
      <ProgressBar value={pct} color={barColor} height={8} />
      <Text style={styles.message}>{getCompletionMessage(pct)}</Text>

      {/* Gate progress */}
      <View style={styles.gateSection}>
        {gateProgress.status === 'passed' ? (
          <Text style={styles.gatePassed}>Gate cleared!</Text>
        ) : (
          <Text style={styles.gateText}>
            {gateProgress.consecutivePasses}/3 clean sessions
          </Text>
        )}
        {sessionResult.isClean && gateProgress.status !== 'passed' && (
          <View style={styles.cleanBadge}>
            <Text style={styles.cleanText}>Clean</Text>
          </View>
        )}
      </View>

      {/* Level up */}
      {leveledUp && newLevel && (
        <View style={styles.levelUpBanner}>
          <Text style={styles.levelUpText}>Level Up! Now at Level {newLevel}</Text>
        </View>
      )}

      {/* Per-exercise breakdown */}
      <View style={styles.breakdown}>
        {sessionResult.exerciseResults.map(er => {
          const name = exerciseNames[er.exerciseId] ?? er.exerciseId;
          const gap = getGapText(er);
          const erPct = er.met ? 100 : Math.round((er.actualCheckedSets / er.targetSets) * 100);

          return (
            <View key={er.exerciseId} style={styles.exerciseRow}>
              <View style={styles.exerciseRowHeader}>
                <Text style={styles.exerciseRowName} numberOfLines={1}>{name}</Text>
                <Text style={[styles.exerciseRowStatus, er.met && styles.exerciseRowMet]}>
                  {er.met ? '✓' : `${erPct}%`}
                </Text>
              </View>
              <ProgressBar value={erPct} color={er.met ? 'emerald' : 'muted'} height={4} />
              {gap && <Text style={styles.gapText}>{gap}</Text>}
            </View>
          );
        })}
      </View>

      {/* Done button */}
      <Pressable onPress={onDone} style={styles.doneButton}>
        <Text style={styles.doneButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  pct: {
    fontSize: 36,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 16,
  },
  gateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  gatePassed: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.success,
  },
  gateText: {
    fontSize: 14,
    color: colors.muted,
  },
  cleanBadge: {
    backgroundColor: colors.successDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cleanText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.success,
  },
  levelUpBanner: {
    backgroundColor: colors.primaryDim,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  levelUpText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  breakdown: {
    marginBottom: 16,
  },
  exerciseRow: {
    marginBottom: 12,
  },
  exerciseRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  exerciseRowName: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  exerciseRowStatus: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.muted,
  },
  exerciseRowMet: {
    color: colors.success,
  },
  gapText: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 2,
  },
  doneButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
});
