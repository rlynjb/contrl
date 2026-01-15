import type { BaseExercise, WorkoutLevel, ExercisesByCategory } from '@/types'

// All exercises flattened into a single array with metadata
export interface ExerciseWithMetadata extends BaseExercise {
  id: string
  level: number
  levelName: string
  category: 'Push' | 'Pull' | 'Squat'
  difficulty: 'Foundation' | 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Expert'
  tags: string[]
}

// Comprehensive list of all exercises with metadata
export const allExercises: ExerciseWithMetadata[] = [
  // Level 0 - Foundation
  {
    id: 'foundation-wall-pushup-band',
    name: "Wall Push-ups with Band Resistance",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "3-2-3-1",
    rest: 90,
    equipment: "Mini band around back",
    level: 0,
    levelName: "Foundation",
    category: "Push",
    difficulty: "Foundation",
    tags: ["wall", "band", "assisted", "beginner-friendly"]
  },
  {
    id: 'foundation-seated-chest-press',
    name: "Seated Chest Press (Band)",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 60,
    equipment: "Mini band",
    level: 0,
    levelName: "Foundation",
    category: "Push",
    difficulty: "Foundation",
    tags: ["seated", "band", "chest", "stability"]
  },
  {
    id: 'foundation-band-pull-apart',
    name: "Standing Band Pull-Apart",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 45,
    equipment: "Mini band",
    level: 0,
    levelName: "Foundation",
    category: "Push",
    difficulty: "Foundation",
    tags: ["standing", "band", "shoulders", "mobility"]
  },
  {
    id: 'foundation-seated-rows',
    name: "Seated Band Rows",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 60,
    equipment: "Mini band",
    level: 0,
    levelName: "Foundation",
    category: "Pull",
    difficulty: "Foundation",
    tags: ["seated", "band", "rows", "back"]
  },
  {
    id: 'foundation-assisted-dead-hang',
    name: "Band-Assisted Dead Hang",
    sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }],
    tempo: "hold",
    rest: 90,
    equipment: "Mini band for assistance",
    level: 0,
    levelName: "Foundation",
    category: "Pull",
    difficulty: "Foundation",
    tags: ["hang", "band", "assisted", "grip", "endurance"]
  },
  {
    id: 'foundation-lat-pulldowns',
    name: "Lat Pulldowns (Band)",
    sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
    tempo: "2-1-2-1",
    rest: 75,
    equipment: "Mini band overhead",
    level: 0,
    levelName: "Foundation",
    category: "Pull",
    difficulty: "Foundation",
    tags: ["band", "pulldown", "lats", "overhead"]
  },
  {
    id: 'foundation-supported-squats',
    name: "Supported Squats (Band)",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "3-2-3-1",
    rest: 90,
    equipment: "Mini band for support",
    level: 0,
    levelName: "Foundation",
    category: "Squat",
    difficulty: "Foundation",
    tags: ["squat", "band", "assisted", "knee-friendly"]
  },
  {
    id: 'foundation-seated-leg-extensions',
    name: "Seated Leg Extensions (Band)",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 60,
    equipment: "Mini band around ankles",
    level: 0,
    levelName: "Foundation",
    category: "Squat",
    difficulty: "Foundation",
    tags: ["seated", "band", "quadriceps", "isolation"]
  },
  {
    id: 'foundation-hip-abduction',
    name: "Standing Hip Abduction (Band)",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-1-1",
    rest: 45,
    equipment: "Mini band around ankles",
    level: 0,
    levelName: "Foundation",
    category: "Squat",
    difficulty: "Foundation",
    tags: ["standing", "band", "hips", "glutes", "stability"]
  },
  {
    id: 'foundation-glute-bridges',
    name: "Glute Bridges (Band)",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 60,
    equipment: "Mini band around knees",
    level: 0,
    levelName: "Foundation",
    category: "Squat",
    difficulty: "Foundation",
    tags: ["bridge", "band", "glutes", "posterior"]
  },

  // Level 1 - Beginner
  {
    id: 'beginner-wall-pushups',
    name: "Wall Push-ups",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Push",
    difficulty: "Beginner",
    tags: ["wall", "bodyweight", "beginner"]
  },
  {
    id: 'beginner-incline-pushups',
    name: "Incline Push-ups",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Push",
    difficulty: "Beginner",
    tags: ["incline", "bodyweight", "progression"]
  },
  {
    id: 'beginner-dead-hang',
    name: "Dead Hang",
    sets: [{ duration: 10 }, { duration: 8 }],
    tempo: "hold",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Pull",
    difficulty: "Beginner",
    tags: ["hang", "grip", "endurance", "bodyweight"]
  },
  {
    id: 'beginner-inverted-rows-high',
    name: "Inverted Rows (High Bar)",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 1,
    levelName: "Beginner",
    category: "Pull",
    difficulty: "Beginner",
    tags: ["rows", "bodyweight", "horizontal", "back"]
  },
  {
    id: 'beginner-chair-assisted-squats',
    name: "Chair Assisted Squats",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Squat",
    difficulty: "Beginner",
    tags: ["squat", "assisted", "chair", "bodyweight"]
  },
  {
    id: 'beginner-calf-raises',
    name: "Calf Raises",
    sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }],
    tempo: "2-1-1-1",
    rest: 45,
    level: 1,
    levelName: "Beginner",
    category: "Squat",
    difficulty: "Beginner",
    tags: ["calves", "bodyweight", "standing"]
  },

  // Level 2 - Novice
  {
    id: 'novice-knee-pushups',
    name: "Knee Push-ups",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["knee", "modified", "bodyweight", "progression"]
  },
  {
    id: 'novice-pike-pushups',
    name: "Pike Push-ups",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["pike", "shoulders", "bodyweight", "vertical"]
  },
  {
    id: 'novice-dead-hang-20s',
    name: "Dead Hang",
    sets: [{ duration: 20 }, { duration: 15 }, { duration: 10 }],
    tempo: "hold",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Pull",
    difficulty: "Novice",
    tags: ["hang", "grip", "endurance", "progression"]
  },
  {
    id: 'novice-inverted-rows',
    name: "Inverted Rows",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Pull",
    difficulty: "Novice",
    tags: ["rows", "bodyweight", "horizontal", "progression"]
  },
  {
    id: 'novice-bodyweight-squats',
    name: "Bodyweight Squats",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Squat",
    difficulty: "Novice",
    tags: ["squat", "bodyweight", "full-range"]
  },
  {
    id: 'novice-lunges',
    name: "Lunges",
    sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Squat",
    difficulty: "Novice",
    tags: ["lunge", "bodyweight", "single-leg", "stability"]
  },

  // Level 3 - Intermediate
  {
    id: 'intermediate-pushups',
    name: "Push-ups",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["pushup", "bodyweight", "standard", "chest"]
  },
  {
    id: 'intermediate-pike-pushups',
    name: "Pike Push-ups",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["pike", "shoulders", "progression"]
  },
  {
    id: 'intermediate-diamond-pushups',
    name: "Diamond Push-ups",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["diamond", "triceps", "advanced", "narrow-grip"]
  },
  {
    id: 'intermediate-dead-hang-30s',
    name: "Dead Hang",
    sets: [{ duration: 30 }, { duration: 25 }, { duration: 20 }],
    tempo: "hold",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["hang", "grip", "strength", "progression"]
  },
  {
    id: 'intermediate-negative-pullups',
    name: "Negative Pull-ups",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "1-1-5-1",
    rest: 120,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["negative", "pullup", "eccentric", "progression"]
  },
  {
    id: 'intermediate-inverted-rows-12',
    name: "Inverted Rows",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["rows", "high-volume", "strength-endurance"]
  },
  {
    id: 'intermediate-bodyweight-squats-15',
    name: "Bodyweight Squats",
    sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["squat", "high-volume", "endurance"]
  },
  {
    id: 'intermediate-jump-squats',
    name: "Jump Squats",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-X-1",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["jump", "explosive", "plyometric", "power"]
  },
  {
    id: 'intermediate-single-leg-glute-bridges',
    name: "Single Leg Glute Bridges",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["bridge", "single-leg", "glutes", "unilateral"]
  },

  // Level 4 - Advanced
  {
    id: 'advanced-pushups-15',
    name: "Push-ups",
    sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-2-1",
    rest: 60,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["pushup", "high-volume", "strength-endurance"]
  },
  {
    id: 'advanced-handstand-pushups-wall',
    name: "Handstand Push-ups (Wall)",
    sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["handstand", "vertical", "shoulders", "advanced"]
  },
  {
    id: 'advanced-archer-pushups',
    name: "Archer Push-ups",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["archer", "unilateral", "advanced", "asymmetric"]
  },
  {
    id: 'advanced-dips',
    name: "Dips",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["dips", "triceps", "parallel-bars", "compound"]
  },
  {
    id: 'advanced-pullups',
    name: "Pull-ups",
    sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["pullup", "vertical", "compound", "back"]
  },
  {
    id: 'advanced-chinups',
    name: "Chin-ups",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["chinup", "biceps", "supinated", "vertical"]
  },
  {
    id: 'advanced-l-hang',
    name: "L-Hang",
    sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }],
    tempo: "hold",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["l-hang", "core", "isometric", "advanced"]
  },
  {
    id: 'advanced-pistol-squat-progression',
    name: "Pistol Squat Progression",
    sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["pistol", "single-leg", "advanced", "balance"]
  },
  {
    id: 'advanced-bulgarian-split-squats',
    name: "Bulgarian Split Squats",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 75,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["bulgarian", "split", "single-leg", "elevated"]
  },
  {
    id: 'advanced-single-leg-calf-raises',
    name: "Single Leg Calf Raises",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-1-1",
    rest: 60,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["calf", "single-leg", "unilateral", "balance"]
  },

  // Level 5 - Expert
  {
    id: 'expert-one-arm-pushup-progression',
    name: "One Arm Push-up Progression",
    sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["one-arm", "elite", "unilateral", "ultimate"]
  },
  {
    id: 'expert-handstand-pushups',
    name: "Handstand Push-ups",
    sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["handstand", "freestanding", "elite", "balance"]
  },
  {
    id: 'expert-planche-pushups',
    name: "Planche Push-ups",
    sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["planche", "elite", "static", "ultimate"]
  },
  {
    id: 'expert-ring-dips',
    name: "Ring Dips",
    sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["rings", "unstable", "elite", "stabilization"]
  },
  {
    id: 'expert-pullups-12',
    name: "Pull-ups",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }, { reps: 6 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["pullup", "high-volume", "elite", "endurance"]
  },
  {
    id: 'expert-muscle-ups',
    name: "Muscle-ups",
    sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 180,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["muscle-up", "elite", "transition", "ultimate"]
  },
  {
    id: 'expert-front-lever-progression',
    name: "Front Lever Progression",
    sets: [{ duration: 10 }, { duration: 8 }, { duration: 6 }],
    tempo: "hold",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["front-lever", "static", "elite", "core"]
  },
  {
    id: 'expert-archer-pullups',
    name: "Archer Pull-ups",
    sets: [{ reps: 4 }, { reps: 3 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["archer", "unilateral", "elite", "asymmetric"]
  },
  {
    id: 'expert-pistol-squats',
    name: "Pistol Squats",
    sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
    tempo: "2-1-2-1",
    rest: 90,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["pistol", "full", "elite", "balance"]
  },
  {
    id: 'expert-shrimp-squats',
    name: "Shrimp Squats",
    sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-1-2-1",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["shrimp", "ultimate", "flexibility", "elite"]
  },
  {
    id: 'expert-jump-lunges',
    name: "Jump Lunges",
    sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
    tempo: "2-1-X-1",
    rest: 75,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["jump", "explosive", "plyometric", "alternating"]
  }
]

// Exercise categorization by type and level
export interface ExerciseCategorization {
  byCategory: {
    Push: ExerciseWithMetadata[]
    Pull: ExerciseWithMetadata[]
    Squat: ExerciseWithMetadata[]
  }
  byLevel: {
    [key: number]: {
      name: string
      exercises: ExerciseWithMetadata[]
    }
  }
  byDifficulty: {
    Foundation: ExerciseWithMetadata[]
    Beginner: ExerciseWithMetadata[]
    Novice: ExerciseWithMetadata[]
    Intermediate: ExerciseWithMetadata[]
    Advanced: ExerciseWithMetadata[]
    Expert: ExerciseWithMetadata[]
  }
  byEquipment: {
    bodyweight: ExerciseWithMetadata[]
    band: ExerciseWithMetadata[]
    assisted: ExerciseWithMetadata[]
  }
  byMovementType: {
    isometric: ExerciseWithMetadata[]
    dynamic: ExerciseWithMetadata[]
    explosive: ExerciseWithMetadata[]
  }
}

// Generate categorized exercise data
export const exerciseCategorization: ExerciseCategorization = {
  byCategory: {
    Push: allExercises.filter(exercise => exercise.category === 'Push'),
    Pull: allExercises.filter(exercise => exercise.category === 'Pull'),
    Squat: allExercises.filter(exercise => exercise.category === 'Squat')
  },
  byLevel: {
    0: {
      name: "Foundation",
      exercises: allExercises.filter(exercise => exercise.level === 0)
    },
    1: {
      name: "Beginner", 
      exercises: allExercises.filter(exercise => exercise.level === 1)
    },
    2: {
      name: "Novice",
      exercises: allExercises.filter(exercise => exercise.level === 2)
    },
    3: {
      name: "Intermediate",
      exercises: allExercises.filter(exercise => exercise.level === 3)
    },
    4: {
      name: "Advanced",
      exercises: allExercises.filter(exercise => exercise.level === 4)
    },
    5: {
      name: "Expert",
      exercises: allExercises.filter(exercise => exercise.level === 5)
    }
  },
  byDifficulty: {
    Foundation: allExercises.filter(exercise => exercise.difficulty === 'Foundation'),
    Beginner: allExercises.filter(exercise => exercise.difficulty === 'Beginner'),
    Novice: allExercises.filter(exercise => exercise.difficulty === 'Novice'),
    Intermediate: allExercises.filter(exercise => exercise.difficulty === 'Intermediate'),
    Advanced: allExercises.filter(exercise => exercise.difficulty === 'Advanced'),
    Expert: allExercises.filter(exercise => exercise.difficulty === 'Expert')
  },
  byEquipment: {
    bodyweight: allExercises.filter(exercise => !exercise.equipment || exercise.equipment === undefined),
    band: allExercises.filter(exercise => exercise.equipment?.includes('band') || exercise.equipment?.includes('Band')),
    assisted: allExercises.filter(exercise => exercise.tags.includes('assisted') || exercise.tags.includes('chair'))
  },
  byMovementType: {
    isometric: allExercises.filter(exercise => 
      exercise.tags.includes('hold') || 
      exercise.tags.includes('hang') || 
      exercise.tags.includes('static') ||
      exercise.tempo === 'hold'
    ),
    dynamic: allExercises.filter(exercise => 
      !exercise.tags.includes('hold') && 
      !exercise.tags.includes('explosive') &&
      exercise.tempo !== 'hold' &&
      !exercise.tags.includes('jump')
    ),
    explosive: allExercises.filter(exercise => 
      exercise.tags.includes('explosive') || 
      exercise.tags.includes('jump') ||
      exercise.tags.includes('plyometric')
    )
  }
}

// Workout levels using the original structure but sourced from our exercise data
export const workoutLevels: WorkoutLevel[] = [
  {
    name: "Foundation",
    description: "Stability, control, and knee-friendly movements",
    exercises: {
      Push: exerciseCategorization.byLevel[0].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[0].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[0].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  {
    name: "Beginner",
    exercises: {
      Push: exerciseCategorization.byLevel[1].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[1].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[1].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  {
    name: "Novice",
    exercises: {
      Push: exerciseCategorization.byLevel[2].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[2].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[2].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  {
    name: "Intermediate",
    exercises: {
      Push: exerciseCategorization.byLevel[3].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[3].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[3].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  {
    name: "Advanced",
    exercises: {
      Push: exerciseCategorization.byLevel[4].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[4].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[4].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  {
    name: "Expert",
    exercises: {
      Push: exerciseCategorization.byLevel[5].exercises.filter(ex => ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: exerciseCategorization.byLevel[5].exercises.filter(ex => ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: exerciseCategorization.byLevel[5].exercises.filter(ex => ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  }
]

// Statistics and insights
export const exerciseStats = {
  totalExercises: allExercises.length,
  exercisesByCategory: {
    Push: exerciseCategorization.byCategory.Push.length,
    Pull: exerciseCategorization.byCategory.Pull.length,
    Squat: exerciseCategorization.byCategory.Squat.length
  },
  exercisesByLevel: Object.entries(exerciseCategorization.byLevel).map(([level, data]) => ({
    level: parseInt(level),
    name: data.name,
    count: data.exercises.length
  })),
  equipmentTypes: {
    bodyweight: exerciseCategorization.byEquipment.bodyweight.length,
    band: exerciseCategorization.byEquipment.band.length,
    assisted: exerciseCategorization.byEquipment.assisted.length
  },
  movementTypes: {
    isometric: exerciseCategorization.byMovementType.isometric.length,
    dynamic: exerciseCategorization.byMovementType.dynamic.length,
    explosive: exerciseCategorization.byMovementType.explosive.length
  }
}
