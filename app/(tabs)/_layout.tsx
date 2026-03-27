import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotionSync } from '../../src/hooks/NotionSyncContext';
import { colors, fonts } from '../../src/constants/theme';

function HeaderBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, configured, syncNow } = useNotionSync();

  const isSyncing = status === 'syncing';

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.logoText}>contrl</Text>
      <View style={styles.headerRight}>
        {configured && (
          <Pressable
            onPress={() => !isSyncing && syncNow()}
            disabled={isSyncing}
            hitSlop={8}
            style={styles.syncButton}
          >
            {isSyncing ? (
              <ActivityIndicator size={14} color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={14} color={colors.muted} />
            )}
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Feather name="settings" size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        header: () => <HeaderBar />,
        tabBarStyle: [styles.tabBar, { paddingBottom: insets.bottom + 30 }],
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tree"
        options={{
          title: 'Tree',
          tabBarIcon: ({ color, size }) => <Feather name="git-branch" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoText: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: colors.primary,
    letterSpacing: 1.5,
  },
  syncButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 1,
  },
});
