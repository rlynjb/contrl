import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';

interface HoldTimerModalProps {
  visible: boolean;
  targetSeconds: number;
  exerciseName: string;
  setLabel: string;
  onComplete: (seconds: number) => void;
  onCancel: () => void;
}

export function HoldTimerModal({
  visible,
  targetSeconds,
  exerciseName,
  setLabel,
  onComplete,
  onCancel,
}: HoldTimerModalProps) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setPhase('ready');
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible]);

  const handleStart = useCallback(() => {
    setPhase('running');
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(sec);
      if (sec >= targetSeconds) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPhase('done');
      }
    }, 200);
  }, [targetSeconds]);

  // Auto-complete when done
  useEffect(() => {
    if (phase === 'done') {
      const timer = setTimeout(() => onComplete(targetSeconds), 600);
      return () => clearTimeout(timer);
    }
  }, [phase, targetSeconds, onComplete]);

  const remaining = Math.max(0, targetSeconds - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = targetSeconds > 0 ? Math.min(elapsed / targetSeconds, 1) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.setLabel}>{setLabel}</Text>

          {/* Timer display */}
          <Text style={[
            styles.timerText,
            phase === 'done' && styles.timerDone,
          ]}>
            {phase === 'done'
              ? 'DONE'
              : `${minutes}:${String(seconds).padStart(2, '0')}`}
          </Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: phase === 'done' ? colors.success : colors.primary,
              },
            ]} />
          </View>

          <Text style={styles.targetLabel}>
            {phase === 'ready'
              ? `Hold for ${targetSeconds}s`
              : phase === 'running'
                ? `${elapsed}s / ${targetSeconds}s`
                : `${targetSeconds}s completed`}
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            {phase === 'ready' && (
              <Pressable style={styles.startButton} onPress={handleStart}>
                <Feather name="play" size={16} color="#fff" />
                <Text style={styles.startButtonText}>Start</Text>
              </Pressable>
            )}
            {phase === 'running' && (
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            )}
          </View>

          {/* Close X */}
          {phase !== 'running' && (
            <Pressable style={styles.closeButton} onPress={onCancel}>
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,8,15,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    maxWidth: 320,
    width: '100%',
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  exerciseName: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 4,
  },
  setLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  timerText: {
    fontSize: 56,
    fontFamily: fonts.extraBold,
    color: colors.text,
    letterSpacing: 2,
  },
  timerDone: {
    color: colors.success,
    fontSize: 40,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.border,
    marginTop: 16,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
  },
  targetLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 2,
  },
  startButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
});
