import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

const COLOR_MAP = {
  cyan: colors.primary,
  emerald: colors.success,
  amber: colors.warning,
  muted: colors.muted,
  push: '#F97316',
  pull: '#06B6D4',
  squat: '#D946EF',
} as const;

type ProgressBarProps = {
  value: number; // 0-100
  color?: keyof typeof COLOR_MAP;
  label?: string;
  showPct?: boolean;
  height?: number;
};

export function ProgressBar({ value, color = 'cyan', label, showPct, height = 6 }: ProgressBarProps) {
  const fillColor = COLOR_MAP[color];
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <View>
      {(label || showPct) && (
        <View style={styles.header}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {showPct ? <Text style={styles.pct}>{Math.round(clamped)}%</Text> : null}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            { width: `${clamped}%`, backgroundColor: fillColor, height },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
  },
  pct: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  track: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 3,
  },
});
