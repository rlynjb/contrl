import { View, Text, StyleSheet } from 'react-native';
import { fonts } from '../../constants/theme';
import type { RepPhase } from '../../lib/pose/rep-counter';

interface DebugPanelProps {
  angle: number;
  phase: RepPhase | 'holding' | 'broken' | null;
  repCount: number;
  holdTimeMs?: number;
  isHold: boolean;
  exerciseType: string;
}

/**
 * Debug overlay showing live pose detection values.
 * Helps understand the math:
 *
 * - Angle: The joint angle being tracked (elbow for push-ups, knee for squats,
 *   hip alignment for planks). Calculated using dot product / law of cosines.
 *
 * - Phase: The state machine position in the rep cycle:
 *   idle → ready (angle ≥ 150°) → down (angle decreasing)
 *   → bottom (angle ≤ 100°) → up (angle increasing) → ready (count++)
 *
 * - Thresholds: readyAngle=160°, bottomAngle=90°, hysteresis=10°
 *   So: ready triggers at 150° (160-10), bottom triggers at 100° (90+10)
 */
export function DebugPanel({ angle, phase, repCount, holdTimeMs, isHold, exerciseType }: DebugPanelProps) {
  const phaseColor = getPhaseColor(phase);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEBUG</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Type</Text>
        <Text style={styles.value}>{exerciseType}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Angle</Text>
        <Text style={[styles.value, styles.angleValue]}>{angle.toFixed(1)}°</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Phase</Text>
        <Text style={[styles.value, { color: phaseColor }]}>{phase ?? '—'}</Text>
      </View>

      {/* Visual angle bar: 0° to 180° */}
      <View style={styles.angleBar}>
        <View style={styles.angleTrack}>
          {/* Bottom threshold marker (90° + 10° hysteresis = 100°) */}
          <View style={[styles.threshold, { left: `${(100 / 180) * 100}%` }]}>
            <Text style={styles.thresholdLabel}>100°</Text>
          </View>
          {/* Ready threshold marker (160° - 10° hysteresis = 150°) */}
          <View style={[styles.threshold, { left: `${(150 / 180) * 100}%` }]}>
            <Text style={styles.thresholdLabel}>150°</Text>
          </View>
          {/* Current angle indicator */}
          <View
            style={[
              styles.angleCursor,
              {
                left: `${Math.min((angle / 180) * 100, 100)}%`,
                backgroundColor: phaseColor,
              },
            ]}
          />
        </View>
        <View style={styles.angleLabels}>
          <Text style={styles.angleLabelText}>0°</Text>
          <Text style={styles.angleLabelText}>90°</Text>
          <Text style={styles.angleLabelText}>180°</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>{isHold ? 'Hold' : 'Reps'}</Text>
        <Text style={[styles.value, styles.countValue]}>
          {isHold ? `${Math.round((holdTimeMs ?? 0) / 1000)}s` : repCount}
        </Text>
      </View>
    </View>
  );
}

function getPhaseColor(phase: string | null): string {
  switch (phase) {
    case 'idle': return '#6b8aab';
    case 'ready': return '#00e5ff';
    case 'down': return '#fbbf24';
    case 'bottom': return '#f97316';
    case 'up': return '#34d399';
    case 'holding': return '#34d399';
    case 'broken': return '#fb7185';
    default: return '#6b8aab';
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 90,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    padding: 10,
    minWidth: 140,
  },
  title: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.5)',
  },
  value: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  angleValue: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#00e5ff',
  },
  countValue: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#34d399',
  },
  angleBar: {
    marginVertical: 6,
  },
  angleTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    position: 'relative',
  },
  threshold: {
    position: 'absolute',
    top: -2,
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  thresholdLabel: {
    position: 'absolute',
    top: -12,
    fontSize: 7,
    color: 'rgba(255,255,255,0.3)',
    transform: [{ translateX: -10 }],
  },
  angleCursor: {
    position: 'absolute',
    top: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
  },
  angleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  angleLabelText: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.3)',
  },
});
