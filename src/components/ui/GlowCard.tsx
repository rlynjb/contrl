import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';

const GLOW_COLORS = {
  cyan: { border: 'rgba(0,229,255,0.2)', shadow: 'rgba(0,229,255,0.15)' },
  emerald: { border: 'rgba(52,211,153,0.2)', shadow: 'rgba(52,211,153,0.15)' },
  amber: { border: 'rgba(251,191,36,0.2)', shadow: 'rgba(251,191,36,0.15)' },
  push: { border: 'rgba(249,115,22,0.2)', shadow: 'rgba(249,115,22,0.15)' },
  pull: { border: 'rgba(6,182,212,0.2)', shadow: 'rgba(6,182,212,0.15)' },
  squat: { border: 'rgba(217,70,239,0.2)', shadow: 'rgba(217,70,239,0.15)' },
  none: { border: colors.border, shadow: 'transparent' },
} as const;

type GlowCardProps = {
  children: React.ReactNode;
  glow?: keyof typeof GLOW_COLORS;
  onPress?: () => void;
  style?: ViewStyle;
};

export function GlowCard({ children, glow = 'none', onPress, style }: GlowCardProps) {
  const glowStyle = GLOW_COLORS[glow];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: glowStyle.border },
        onPress && pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.85,
  },
});
