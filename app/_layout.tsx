import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useDatabase } from '../src/hooks/useDatabase';
import { colors } from '../src/constants/theme';
import { NotionSyncProvider } from '../src/hooks/NotionSyncContext';
import { GameStateContext, useGameStateInternal } from '../src/hooks/useGameState';
import { isNotionConfigured, isAutoSyncEnabled } from '../src/services/notion/config';
import { syncAll } from '../src/services/notion/sync';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { ready, error } = useDatabase();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const gameState = useGameStateInternal(ready);

  // Auto-sync on app open
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const configured = await isNotionConfigured();
      const autoSync = await isAutoSyncEnabled();
      if (configured && autoSync) {
        syncAll().catch(err => console.warn('[contrl] Auto-sync failed:', err));
      }
    })();
  }, [ready]);

  useEffect(() => {
    if (ready && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [ready, fontsLoaded]);

  if (error && fontsLoaded) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Unable to open contrl</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GameStateContext.Provider value={gameState}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </GameStateContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <NotionSyncProvider>
      <AppContent />
    </NotionSyncProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 8,
  },
  errorText: {
    color: colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
