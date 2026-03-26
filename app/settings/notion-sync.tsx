import { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { colors } from '../../src/constants/theme';
import { useNotionSync } from '../../src/hooks/NotionSyncContext';
import {
  getNotionToken,
  setNotionToken,
  getSessionsDbId,
  setSessionsDbId,
  getExercisesDbId,
  setExercisesDbId,
  isAutoSyncEnabled,
  setAutoSync,
  clearNotionConfig,
} from '../../src/services/notion/config';
import { getDatabase as testNotionConnection } from '../../src/services/notion/api';

export default function NotionSyncScreen() {
  const { refresh } = useNotionSync();

  const [token, setTokenState] = useState('');
  const [sessionsDb, setSessionsDb] = useState('');
  const [exercisesDb, setExercisesDb] = useState('');
  const [autoSyncOn, setAutoSyncOn] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getNotionToken();
      const s = await getSessionsDbId();
      const e = await getExercisesDbId();
      const a = await isAutoSyncEnabled();
      if (t) setTokenState(t);
      if (s) setSessionsDb(s);
      if (e) setExercisesDb(e);
      setAutoSyncOn(a);
    })();
  }, []);

  const handleTestConnection = async () => {
    if (!token || !sessionsDb) {
      Alert.alert('Missing', 'Enter token and Sessions DB ID first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await testNotionConnection(token, sessionsDb);
      if (exercisesDb) {
        await testNotionConnection(token, exercisesDb);
      }
      setTestResult('success');
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!token || !sessionsDb) {
      Alert.alert('Missing', 'Token and Sessions DB ID are required');
      return;
    }
    setSaving(true);
    try {
      await setNotionToken(token);
      await setSessionsDbId(sessionsDb);
      if (exercisesDb) {
        await setExercisesDbId(exercisesDb);
      }
      await setAutoSync(autoSyncOn);
      await refresh();
      Alert.alert('Saved', 'Notion configuration saved');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Notion',
      'This will remove all Notion credentials. Your local data will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await clearNotionConfig();
            setTokenState('');
            setSessionsDb('');
            setExercisesDb('');
            setAutoSyncOn(false);
            await refresh();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notion Sync</Text>
      <Text style={styles.subtitle}>Connect your Notion workspace for cloud backup</Text>

      {/* Token */}
      <Text style={styles.label}>Integration Token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setTokenState}
        placeholder="secret_..."
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Sessions DB */}
      <Text style={styles.label}>Sessions Database ID</Text>
      <TextInput
        style={styles.input}
        value={sessionsDb}
        onChangeText={setSessionsDb}
        placeholder="32-character ID from URL"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Exercises DB */}
      <Text style={styles.label}>Exercises Database ID (optional)</Text>
      <TextInput
        style={styles.input}
        value={exercisesDb}
        onChangeText={setExercisesDb}
        placeholder="32-character ID from URL"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Auto-sync toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Auto-sync on app open</Text>
        <Pressable
          onPress={() => setAutoSyncOn(!autoSyncOn)}
          style={[styles.toggle, autoSyncOn && styles.toggleOn]}
        >
          <View style={[styles.toggleThumb, autoSyncOn && styles.toggleThumbOn]} />
        </Pressable>
      </View>

      {/* Test connection */}
      <Pressable
        style={styles.testButton}
        onPress={handleTestConnection}
        disabled={testing}
      >
        <Text style={styles.testButtonText}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Text>
      </Pressable>

      {testResult === 'success' && (
        <Text style={styles.testSuccess}>Connection successful!</Text>
      )}
      {testResult === 'error' && (
        <Text style={styles.testError}>Connection failed. Check your credentials.</Text>
      )}

      {/* Save */}
      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Text>
      </Pressable>

      {/* Disconnect */}
      {token && (
        <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect Notion</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: colors.primaryDim,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.muted,
  },
  toggleThumbOn: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  testButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  testSuccess: {
    fontSize: 13,
    color: colors.success,
    marginTop: 8,
    textAlign: 'center',
  },
  testError: {
    fontSize: 13,
    color: colors.danger,
    marginTop: 8,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: colors.primaryDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  disconnectButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
});
