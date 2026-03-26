import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/constants/theme';
import { useNotionSync } from '../../src/hooks/NotionSyncContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { status, lastSynced, result, configured, syncNow } = useNotionSync();

  const isSyncing = status === 'syncing';
  const lastSyncDisplay = lastSynced
    ? formatTimeSince(lastSynced)
    : 'Never';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Notion Sync Section */}
      <Text style={styles.sectionTitle}>NOTION SYNC</Text>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/settings/notion-sync')}
      >
        <View>
          <Text style={styles.rowLabel}>Connection</Text>
          <Text style={styles.rowSubtitle}>
            {configured ? 'Connected' : 'Not configured'}
          </Text>
        </View>
        <Text style={styles.rowChevron}>{'>'}</Text>
      </Pressable>

      {configured && (
        <>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>Last synced</Text>
              <Text style={styles.rowSubtitle}>{lastSyncDisplay}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={() => !isSyncing && syncNow()}
            disabled={isSyncing}
          >
            <Text style={styles.syncButtonText}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Text>
          </Pressable>

          {result && (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>
                Pulled: {result.pulled} | Pushed: {result.pushed}
              </Text>
              {result.errors.length > 0 && (
                <Text style={styles.resultError}>
                  {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
                </Text>
              )}
              {result.debug.length > 0 && (
                <View style={styles.debugSection}>
                  {result.debug.map((d, i) => (
                    <Text key={i} style={styles.debugText}>{d}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* Setup Guide */}
      <Pressable
        style={[styles.row, { marginTop: 16 }]}
        onPress={() => router.push('/settings/notion-guide')}
      >
        <Text style={styles.rowLabel}>Setup Guide</Text>
        <Text style={styles.rowChevron}>{'>'}</Text>
      </Pressable>

      {/* App Info */}
      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>ABOUT</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Version</Text>
        <Text style={styles.rowSubtitle}>1.0.0</Text>
      </View>
    </ScrollView>
  );
}

function formatTimeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  rowChevron: {
    fontSize: 16,
    color: colors.muted,
  },
  syncButton: {
    backgroundColor: colors.primaryDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  resultBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  resultText: {
    fontSize: 13,
    color: colors.text,
  },
  resultError: {
    fontSize: 13,
    color: colors.danger,
    marginTop: 4,
  },
  debugSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  debugText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
});
