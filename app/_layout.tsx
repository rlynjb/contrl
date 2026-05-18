import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, LogBox } from 'react-native';

// Suppress iOS-only RNScreens prop warnings that expo-router emits on Android.
// These are library-level noise (backTitleFontFamily, largeTitle*, etc.) that
// LogBox otherwise surfaces on every stack navigation.
LogBox.ignoreLogs([/\[RNScreens\]: .* prop is not available on Android/]);
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { Nunito_400Regular } from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';
import { useDatabase } from '../src/hooks/useDatabase';
import { pullRestoreIfFresh, pushChanges } from '../src/services/sync';
import { colors } from '../src/constants/theme';
import { GameStateContext, useGameStateInternal } from '../src/hooks/useGameState';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { ready, error } = useDatabase();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Nunito_400Regular,
  });
  const gameState = useGameStateInternal(ready);

  useEffect(() => {
    if (ready && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [ready, fontsLoaded]);

  useEffect(() => {
    if (!ready) return;
    pullRestoreIfFresh()
      .then(() => pushChanges())
      .catch(err => console.warn('[sync] startup sync failed:', err));
  }, [ready]);

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
