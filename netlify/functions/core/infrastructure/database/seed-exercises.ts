import { sql } from './connection';
import { allExercises } from '../../../../../src/mocks/data/exercises';
import { randomUUID } from 'crypto';

export async function seedExercises() {
  try {
    console.log('🌱 Seeding exercise data...');
    
    // First, get level and category mappings
    const levels = await sql`SELECT id, name, level_order FROM workout_levels ORDER BY level_order`;
    const categories = await sql`SELECT id, name FROM exercise_categories`;
    
    const levelMap = Object.fromEntries(levels.map(l => [l.level_order, l.id]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.name, c.id]));
    
    console.log('Level mapping:', levelMap);
    console.log('Category mapping:', categoryMap);
    
    // Insert exercises
    let successCount = 0;
    for (const exercise of allExercises) {
      try {
        // Generate a proper UUID for each exercise
        const exerciseUuid = randomUUID();
        
        await sql`
          INSERT INTO exercises (
            id, name, level_id, category_id,
            default_sets, default_tempo, default_rest_seconds,
            default_equipment, default_notes, tags
          ) VALUES (
            ${exerciseUuid},
            ${exercise.name},
            ${levelMap[exercise.level]},
            ${categoryMap[exercise.category]},
            ${JSON.stringify(exercise.sets)},
            ${exercise.tempo || null},
            ${exercise.rest || null},
            ${exercise.equipment || null},
            ${exercise.notes || null},
            ${exercise.tags}
          )
        `;
        successCount++;
      } catch (error) {
        console.error(`Error inserting exercise ${exercise.name}:`, error);
      }
    }
    
    console.log(`✅ Seeded ${successCount}/${allExercises.length} exercises successfully`);
    return true;
  } catch (error) {
    console.error('❌ Exercise seeding failed:', error);
    return false;
  }
}
