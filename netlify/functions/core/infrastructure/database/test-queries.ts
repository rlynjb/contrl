import { 
  getExercisesWithDifficulty, 
  getUserCurrentLevelsWithDetails,
  getExercisesForUserLevel,
  updateUserLevel,
  getWorkoutSessionsWithLevels
} from './queries';
import { sql } from './connection';

async function testQueries() {
  try {
    console.log('🧪 Testing database queries with updated schema...\n');

    // Test 1: Get exercises with difficulty levels
    console.log('1️⃣ Testing getExercisesWithDifficulty (Push category):');
    const pushExercises = await getExercisesWithDifficulty('Push');
    console.log(`   Found ${pushExercises.length} Push exercises`);
    if (pushExercises.length > 0) {
      const first = pushExercises[0];
      console.log(`   Example: ${first.name} - ${first.difficulty} (Level ${first.level_order})`);
    }

    // Test 2: Get user levels with details
    console.log('\n2️⃣ Testing getUserCurrentLevelsWithDetails:');
    // First get a test user
    const users = await sql`SELECT id FROM users LIMIT 1`;
    if (users.length > 0) {
      const userId = users[0].id;
      const userLevels = await getUserCurrentLevelsWithDetails(userId);
      console.log(`   User has levels in ${userLevels.length} categories:`);
      userLevels.forEach(level => {
        console.log(`   - ${level.category}: ${level.level_name} (${level.current_level})`);
      });

      // Test 3: Get exercises for user level
      if (userLevels.length > 0) {
        const firstCategory = userLevels[0].category;
        console.log(`\n3️⃣ Testing getExercisesForUserLevel (${firstCategory})::`);
        const availableExercises = await getExercisesForUserLevel(userId, firstCategory);
        console.log(`   Found ${availableExercises.length} exercises for user's ${firstCategory} level`);
        
        const available = availableExercises.filter(e => e.availability === 'available');
        const nextLevel = availableExercises.filter(e => e.availability === 'next_level');
        const locked = availableExercises.filter(e => e.availability === 'locked');
        
        console.log(`   - Available: ${available.length}`);
        console.log(`   - Next level: ${nextLevel.length}`);
        console.log(`   - Locked: ${locked.length}`);
      }

      // Test 4: Get workout sessions with levels
      console.log('\n4️⃣ Testing getWorkoutSessionsWithLevels:');
      const sessions = await getWorkoutSessionsWithLevels(userId, 5);
      console.log(`   Found ${sessions.length} recent workout sessions`);
      sessions.forEach((session, i) => {
        const levelInfo = session.session_level ? ` (${session.session_level})` : ' (No level)';
        console.log(`   ${i + 1}. ${session.session_date} - ${session.status}${levelInfo}`);
      });

    } else {
      console.log('   No test users found. Run npm run db:seed first.');
    }

    console.log('\n✅ All query tests completed successfully!');

  } catch (error) {
    console.error('❌ Query test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  testQueries().catch(console.error);
}

export { testQueries };
