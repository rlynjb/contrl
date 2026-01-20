import { sql } from './connection';

// Query helpers for the updated schema

/**
 * Get exercises with their difficulty level (from workout_levels table)
 */
export async function getExercisesWithDifficulty(categoryName?: string) {
  try {
    if (categoryName) {
      return await sql`
        SELECT 
          e.id,
          e.name,
          e.default_sets,
          e.default_tempo,
          e.default_rest_seconds,
          e.default_equipment,
          e.default_notes,
          e.tags,
          wl.name as difficulty,
          wl.description as difficulty_description,
          wl.level_order,
          ec.name as category
        FROM exercises e
        JOIN workout_levels wl ON e.level_id = wl.id
        JOIN exercise_categories ec ON e.category_id = ec.id
        WHERE ec.name = ${categoryName}
        ORDER BY wl.level_order, e.name
      `;
    } else {
      return await sql`
        SELECT 
          e.id,
          e.name,
          e.default_sets,
          e.default_tempo,
          e.default_rest_seconds,
          e.default_equipment,
          e.default_notes,
          e.tags,
          wl.name as difficulty,
          wl.description as difficulty_description,
          wl.level_order,
          ec.name as category
        FROM exercises e
        JOIN workout_levels wl ON e.level_id = wl.id
        JOIN exercise_categories ec ON e.category_id = ec.id
        ORDER BY ec.name, wl.level_order, e.name
      `;
    }
  } catch (error) {
    console.error('Error fetching exercises with difficulty:', error);
    throw error;
  }
}

/**
 * Get user's current levels with workout level details
 */
export async function getUserCurrentLevelsWithDetails(userId: string) {
  try {
    return await sql`
      SELECT 
        ec.name as category,
        ucl.current_level,
        wl.name as level_name,
        wl.description as level_description,
        wl.level_order,
        ucl.created_at,
        ucl.updated_at
      FROM user_current_levels ucl
      JOIN exercise_categories ec ON ucl.category_id = ec.id
      JOIN workout_levels wl ON ucl.workout_level_id = wl.id
      WHERE ucl.user_id = ${userId}
      ORDER BY ec.name
    `;
  } catch (error) {
    console.error('Error fetching user current levels:', error);
    throw error;
  }
}

/**
 * Get exercises suitable for user's current level in a category
 */
export async function getExercisesForUserLevel(userId: string, categoryName: string) {
  try {
    return await sql`
      SELECT 
        e.id,
        e.name,
        e.default_sets,
        e.default_tempo,
        e.default_rest_seconds,
        e.default_equipment,
        e.default_notes,
        e.tags,
        wl.name as difficulty,
        wl.level_order,
        CASE 
          WHEN wl.level_order <= ucl.current_level THEN 'available'
          WHEN wl.level_order = ucl.current_level + 1 THEN 'next_level'
          ELSE 'locked'
        END as availability
      FROM exercises e
      JOIN workout_levels wl ON e.level_id = wl.id
      JOIN exercise_categories ec ON e.category_id = ec.id
      JOIN user_current_levels ucl ON ucl.category_id = ec.id
      WHERE ucl.user_id = ${userId} 
        AND ec.name = ${categoryName}
      ORDER BY wl.level_order, e.name
    `;
  } catch (error) {
    console.error('Error fetching exercises for user level:', error);
    throw error;
  }
}

/**
 * Update user's level in a category (with proper FK handling)
 */
export async function updateUserLevel(userId: string, categoryName: string, newLevel: number) {
  try {
    // Validate level range
    if (newLevel < 0 || newLevel > 5) {
      throw new Error('Level must be between 0 and 5');
    }

    // Get category and workout level IDs
    const [category] = await sql`
      SELECT id FROM exercise_categories WHERE name = ${categoryName}
    `;
    
    const [workoutLevel] = await sql`
      SELECT id FROM workout_levels WHERE level_order = ${newLevel}
    `;

    if (!category || !workoutLevel) {
      throw new Error(`Invalid category (${categoryName}) or level (${newLevel})`);
    }

    // Update user level
    return await sql`
      INSERT INTO user_current_levels (user_id, category_id, current_level, workout_level_id)
      VALUES (${userId}, ${category.id}, ${newLevel}, ${workoutLevel.id})
      ON CONFLICT (user_id, category_id) DO UPDATE SET
        current_level = EXCLUDED.current_level,
        workout_level_id = EXCLUDED.workout_level_id,
        updated_at = NOW()
      RETURNING *
    `;
  } catch (error) {
    console.error('Error updating user level:', error);
    throw error;
  }
}

/**
 * Get workout sessions with level information
 */
export async function getWorkoutSessionsWithLevels(userId: string, limit: number = 10) {
  try {
    return await sql`
      SELECT 
        ws.id,
        ws.session_type,
        ws.session_date,
        ws.duration_minutes,
        ws.status,
        ws.notes,
        wl.name as session_level,
        wl.description as level_description,
        ws.created_at
      FROM workout_sessions ws
      LEFT JOIN workout_levels wl ON ws.level_id = wl.id
      WHERE ws.user_id = ${userId}
      ORDER BY ws.session_date DESC, ws.created_at DESC
      LIMIT ${limit}
    `;
  } catch (error) {
    console.error('Error fetching workout sessions:', error);
    throw error;
  }
}
