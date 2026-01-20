import { sql } from './connection';
import { mockCurrentUserLevels } from '../../../../../src/data/CurrentLevel/mock';

export async function seedUserProgress() {
  try {
    console.log('🌱 Seeding user progress data...');
    
    // Create a test user
    const [user] = await sql`
      INSERT INTO users (email, name)
      VALUES ('test@example.com', 'Test User')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    
    console.log('Created/found user:', user.id);
    
    // Get categories and levels
    const categories = await sql`SELECT id, name FROM exercise_categories`;
    const levels = await sql`SELECT id, level_order FROM workout_levels ORDER BY level_order`;
    
    const categoryMap = Object.fromEntries(categories.map(c => [c.name, c.id]));
    const levelMap = Object.fromEntries(levels.map(l => [l.level_order, l.id]));
    
    console.log('Category mapping:', categoryMap);
    console.log('Level mapping:', levelMap);
    
    // Insert user current levels
    for (const [category, level] of Object.entries(mockCurrentUserLevels)) {
      try {
        await sql`
          INSERT INTO user_current_levels (user_id, category_id, current_level, workout_level_id)
          VALUES (${user.id}, ${categoryMap[category]}, ${level}, ${levelMap[level]})
          ON CONFLICT (user_id, category_id) DO UPDATE SET
            current_level = EXCLUDED.current_level,
            workout_level_id = EXCLUDED.workout_level_id,
            updated_at = NOW()
        `;
        console.log(`Set ${category} level to ${level}`);
      } catch (error) {
        console.error(`Error setting level for ${category}:`, error);
      }
    }
    
    console.log('✅ Seeded user progress successfully');
    return true;
  } catch (error) {
    console.error('❌ User progress seeding failed:', error);
    return false;
  }
}
