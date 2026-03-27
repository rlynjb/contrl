import { Text, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts } from '../../src/constants/theme';

export default function NotionGuideScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notion Setup Guide</Text>

      <Text style={styles.step}>1. Create a Notion integration</Text>
      <Text style={styles.body}>
        Go to notion.so/my-integrations and create a new internal integration.
        Copy the token.
      </Text>

      <Text style={styles.step}>2. Create Sessions database</Text>
      <Text style={styles.body}>
        Create a new full-page database in Notion with these properties:{'\n\n'}
        - Name (title){'\n'}
        - Date (date){'\n'}
        - Category (select: push, pull, squat){'\n'}
        - Level (number){'\n'}
        - Exercises (relation → Exercises database){'\n'}
        - Session Data (rich text){'\n'}
        - Notes (rich text){'\n'}
        - Passed (checkbox){'\n'}
        - contrl ID (rich text)
      </Text>

      <Text style={styles.step}>3. Create Exercises database</Text>
      <Text style={styles.body}>
        Create another database with:{'\n\n'}
        - Name (title){'\n'}
        - Category (select: push, pull, squat){'\n'}
        - Level (number 1-5){'\n'}
        - Target Sets (number){'\n'}
        - Target Reps (number){'\n'}
        - Sort Order (number){'\n'}
        - Tempo (rich text){'\n'}
        - Notes (rich text)
      </Text>

      <Text style={styles.step}>4. Connect the integration</Text>
      <Text style={styles.body}>
        Open each database, click "..." in the top right, then "Connections",
        and add your integration.
      </Text>

      <Text style={styles.step}>5. Copy database IDs</Text>
      <Text style={styles.body}>
        Open each database as a full page. The database ID is the 32-character
        string in the URL between the workspace name and the question mark.
      </Text>
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
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 24,
  },
  step: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: colors.primary,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
