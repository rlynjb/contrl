import { View, Text, StyleSheet } from 'react-native';
import { categoryColors, categoryBg, categoryBorder } from '@/constants/theme';
import type { Category } from '@/types';

type CategoryBadgeProps = {
  category: Category;
  size?: 'sm' | 'md';
};

export function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: categoryBg[category],
          borderColor: categoryBorder[category],
        },
        isSm && styles.badgeSm,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: categoryColors[category] },
          isSm && styles.textSm,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textSm: {
    fontSize: 10,
  },
});
