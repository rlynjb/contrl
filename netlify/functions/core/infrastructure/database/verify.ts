import { sql } from './connection';

export async function verifyDatabaseSetup() {
  try {
    console.log('🔍 Verifying database setup...\n');
    
    // Check tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('✅ Tables created:');
    tables.forEach(table => console.log(`  - ${table.table_name}`));
    
    // Check workout levels
    const levels = await sql`SELECT name, level_order FROM workout_levels ORDER BY level_order`;
    console.log('\n✅ Workout levels:');
    levels.forEach(level => console.log(`  - ${level.name} (${level.level_order})`));
    
    // Check categories
    const categories = await sql`SELECT name, description FROM exercise_categories`;
    console.log('\n✅ Exercise categories:');
    categories.forEach(cat => console.log(`  - ${cat.name}: ${cat.description}`));
    
    // Check exercises count
    const [exerciseCount] = await sql`SELECT COUNT(*) as count FROM exercises`;
    console.log(`\n✅ Exercises in database: ${exerciseCount.count}`);
    
    // Check if user exists
    const [userCount] = await sql`SELECT COUNT(*) as count FROM users`;
    console.log(`✅ Users in database: ${userCount.count}`);
    
    // Check user progress
    if (userCount.count > 0) {
      const progress = await sql`
        SELECT 
          ec.name, 
          ucl.current_level,
          wl.name as level_name,
          wl.description as level_description
        FROM user_current_levels ucl
        JOIN exercise_categories ec ON ucl.category_id = ec.id
        JOIN workout_levels wl ON ucl.workout_level_id = wl.id
        ORDER BY ec.name
      `;
      console.log('\n✅ User progress levels:');
      progress.forEach(p => console.log(`  - ${p.name}: Level ${p.current_level} (${p.level_name}) - ${p.level_description}`));
    }
    
    console.log('\n🎉 Database setup verification completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    return false;
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyDatabaseSetup().catch(console.error);
}
