import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

interface SetCameraHUDProps {
  exerciseName: string;
  setLabel: string;
  isHold: boolean;
  repCount: number;
  holdTimeMs: number;
  targetValue: number;
  targetReached: boolean;
  isHolding: boolean;
  countdown: number | null;
  onStart: () => void;
  onDone: () => void;
  onCancel: () => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function SetCameraHUD({
  exerciseName,
  setLabel,
  isHold,
  repCount,
  holdTimeMs,
  targetValue,
  targetReached,
  isHolding,
  countdown,
  onStart,
  onDone,
  onCancel,
}: SetCameraHUDProps) {
  // Waiting for user to tap Start
  if (countdown === null) {
    return (
      <View style={styles.container}>
        <View style={styles.infoSection}>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.setLabel}>{setLabel}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.startButton} onPress={onStart}>
            <Text style={styles.startButtonText}>Start</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Counting down
  if (countdown > 0) {
    return (
      <View style={styles.container}>
        <View style={styles.infoSection}>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownLabel}>Get ready...</Text>
          <Text style={styles.setLabel}>{setLabel}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Active counting
  return (
    <View style={styles.container}>
      <View style={styles.infoSection}>
        <Text style={styles.exerciseName}>{exerciseName}</Text>

        {isHold ? (
          <>
            <Text style={[styles.bigValue, targetReached && styles.valueReached]}>
              {formatTime(holdTimeMs)}
            </Text>
            <Text
              style={[
                styles.holdingStatus,
                isHolding ? styles.holdingActive : styles.holdingBroken,
              ]}
            >
              {isHolding ? 'Holding' : 'Position lost'}
            </Text>
            <Text style={styles.targetText}>Target: {targetValue}s</Text>
          </>
        ) : (
          <>
            <Text style={[styles.bigValue, targetReached && styles.valueReached]}>
              {repCount}
            </Text>
            <Text style={styles.targetText}>Target: {targetValue} reps</Text>
          </>
        )}

        <Text style={styles.setLabel}>{setLabel}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  infoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  exerciseName: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#fff',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  setLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },
  countdownNumber: {
    fontSize: 72,
    fontFamily: fonts.extraBold,
    color: colors.primary,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  countdownLabel: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  bigValue: {
    fontSize: 64,
    fontFamily: fonts.extraBold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  valueReached: {
    color: colors.success,
  },
  targetText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  holdingStatus: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    marginTop: 4,
  },
  holdingActive: {
    color: colors.success,
  },
  holdingBroken: {
    color: colors.warning,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  startButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  doneButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
});
