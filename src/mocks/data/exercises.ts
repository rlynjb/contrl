/**
 * Exercise Mock Data
 */

import type { ExerciseWithMetadata, WorkoutLevels } from '@/api/exercises'

// Comprehensive list of all exercises with metadata
export const allExercises: ExerciseWithMetadata[] = [
  // Level 0 - Foundation (commented out)
  // {
  //   id: 'foundation-wall-pushup-band',
  //   name: "Wall Push-ups with Band Resistance",
  //   sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
  //   tempo: "3-2-3-1",
  //   rest: 90,
  //   equipment: "Mini band around back",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Push",
  //   difficulty: "Foundation",
  //   tags: ["wall", "band", "assisted", "beginner-friendly"]
  // },
  // {
  //   id: 'foundation-seated-chest-press',
  //   name: "Seated Chest Press (Band)",
  //   sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
  //   tempo: "2-1-2-1",
  //   rest: 60,
  //   equipment: "Mini band",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Push",
  //   difficulty: "Foundation",
  //   tags: ["seated", "band", "chest", "stability"]
  // },
  // {
  //   id: 'foundation-band-pull-apart',
  //   name: "Standing Band Pull-Apart",
  //   sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
  //   tempo: "2-1-2-1",
  //   rest: 45,
  //   equipment: "Mini band",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Push",
  //   difficulty: "Foundation",
  //   tags: ["standing", "band", "shoulders", "mobility"]
  // },
  // {
  //   id: 'foundation-seated-rows',
  //   name: "Seated Band Rows",
  //   sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
  //   tempo: "2-1-2-1",
  //   rest: 60,
  //   equipment: "Mini band",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Pull",
  //   difficulty: "Foundation",
  //   tags: ["seated", "band", "rows", "back"]
  // },
  // {
  //   id: 'foundation-assisted-dead-hang',
  //   name: "Band-Assisted Dead Hang",
  //   sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }],
  //   tempo: "hold",
  //   rest: 90,
  //   equipment: "Mini band for assistance",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Pull",
  //   difficulty: "Foundation",
  //   tags: ["hang", "band", "assisted", "grip", "endurance"]
  // },
  // {
  //   id: 'foundation-lat-pulldowns',
  //   name: "Lat Pulldowns (Band)",
  //   sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
  //   tempo: "2-1-2-1",
  //   rest: 75,
  //   equipment: "Mini band overhead",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Pull",
  //   difficulty: "Foundation",
  //   tags: ["band", "pulldown", "lats", "overhead"]
  // },
  // {
  //   id: 'foundation-supported-squats',
  //   name: "Supported Squats (Band)",
  //   sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
  //   tempo: "3-2-3-1",
  //   rest: 90,
  //   equipment: "Mini band for support",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Squat",
  //   difficulty: "Foundation",
  //   tags: ["squat", "band", "assisted", "knee-friendly"]
  // },
  // {
  //   id: 'foundation-seated-leg-extensions',
  //   name: "Seated Leg Extensions (Band)",
  //   sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
  //   tempo: "2-1-2-1",
  //   rest: 60,
  //   equipment: "Mini band around ankles",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Squat",
  //   difficulty: "Foundation",
  //   tags: ["seated", "band", "quadriceps", "isolation"]
  // },
  // {
  //   id: 'foundation-hip-abduction',
  //   name: "Standing Hip Abduction (Band)",
  //   sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
  //   tempo: "2-1-1-1",
  //   rest: 45,
  //   equipment: "Mini band around ankles",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Squat",
  //   difficulty: "Foundation",
  //   tags: ["standing", "band", "hips", "glutes", "stability"]
  // },
  // {
  //   id: 'foundation-glute-bridges',
  //   name: "Glute Bridges (Band)",
  //   sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
  //   tempo: "2-1-2-1",
  //   rest: 60,
  //   equipment: "Mini band around knees",
  //   level: 0,
  //   levelName: "Foundation",
  //   category: "Squat",
  //   difficulty: "Foundation",
  //   tags: ["bridge", "band", "glutes", "posterior"]
  // },

  // Level 1 - Beginner
  {
    id: 'beginner-negative-push-ups',
    name: "Negative Push-ups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "4-2-0-0",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Push",
    difficulty: "Beginner",
    tags: ["bodyweight", "beginner"]
  },
  {
    id: 'beginner-scapula-push-ups',
    name: "Scapula Push-ups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2-0-1-0",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Push",
    difficulty: "Beginner",
    tags: ["incline", "bodyweight", "progression"]
  },
  {
    id: 'beginner-plank-hold',
    name: "Plank Hold",
    sets: [{ duration: 60 }, { duration: 60 }, { duration: 60 }, { duration: 60 }],
    tempo: "",
    rest: 60,
    level: 1,
    levelName: "Beginner",
    category: "Push",
    difficulty: "Beginner",
    tags: ["incline", "bodyweight", "progression"]
  },
  {
    id: 'beginner-trx-lat-pull-down',
    name: "TRX Lat Pull-down",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Pull",
    difficulty: "Beginner",
    tags: ["hang", "grip", "endurance", "bodyweight"]
  },
  {
    id: 'beginner-trx-inverted-row',
    name: "TRX Inverted Row (Australian Pull-ups)",
    sets: [{ reps: 15 }, { reps: 15 }, { reps: 15 }],
    tempo: "2-0-1-0",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Pull",
    difficulty: "Beginner",
    tags: ["hang", "grip", "endurance", "bodyweight"]
  },
  {
    id: 'beginner-trx-passive-hang',
    name: "TRX Passive Hang",
    sets: [{ duration: 60 }, { duration: 60 }, { duration: 60 }],
    tempo: "",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Pull",
    difficulty: "Beginner",
    tags: ["rows", "bodyweight", "horizontal", "back"]
  },
  {
    id: 'beginner-deep-squats',
    name: "Deep squats",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2-0-1-0",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Squat",
    difficulty: "Beginner",
    tags: ["squat", "bodyweight"]
  },
  {
    id: 'beginner-narrow-stance-squats',
    name: "Narrow stance squats",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2-0-1-0",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Squat",
    difficulty: "Beginner",
    tags: ["squat", "bodyweight"]
  },
  {
    id: 'beginner-bodyweight-squats',
    name: "Bodyweight Squats",
    sets: [{ reps: 15 }, { reps: 15 }, { reps: 15 }],
    tempo: "2-0-1-0",
    rest: 0,
    level: 1,
    levelName: "Beginner",
    category: "Squat",
    difficulty: "Beginner",
    tags: ["squat", "bodyweight"]
  },

  // Level 2 - Novice
  {
    id: 'novice-normal-pushups',
    name: "Normal Push-ups",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2-0-1-0",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["knee", "modified", "bodyweight", "progression"]
  },
  {
    id: 'novice-negative-pushups',
    name: "Negative Push-ups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "4-2-0-0",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["pike", "shoulders", "bodyweight", "vertical"]
  },
  {
    id: 'novice-scapula-pushups',
    name: "Scapula Pushups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2-0-1-0",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["hang", "grip", "endurance", "progression"]
  },
  {
    id: 'novice-plank-hold',
    name: "Plank Hold",
    sets: [{ duration: 60 }, { duration: 60 }, { duration: 60 }, { duration: 60 }],
    tempo: "hold",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Push",
    difficulty: "Novice",
    tags: ["rows", "bodyweight", "horizontal", "progression"]
  },
  {
    id: 'novice-trx-inverted-row',
    name: "TRX Inverted Row (straight legs)",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Pull",
    difficulty: "Novice",
    tags: ["rows", "bodyweight", "horizontal", "progression"]
  },
  {
    id: 'novice-trx-scapula-pullups',
    name: "TRX Scapula Pullups",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 2,
    levelName: "Novice",
    category: "Pull",
    difficulty: "Novice",
    tags: ["rows", "bodyweight", "horizontal", "progression"]
  },
  {
    id: 'novice-trx-bulgarian-squats',
    name: "TRX Bulgarian Squats",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "3-0-1-0",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Squat",
    difficulty: "Novice",
    tags: ["squat", "bodyweight", "full-range"]
  },
  {
    id: 'novice-narrow-stance-squats',
    name: "Narrow Stance Squats",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "4-1-4-0",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Squat",
    difficulty: "Novice",
    tags: ["lunge", "bodyweight", "single-leg", "stability"]
  },
  {
    id: 'novice-deep-squats',
    name: "Deep Squats",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "3-0-1-0",
    rest: 60,
    level: 2,
    levelName: "Novice",
    category: "Squat",
    difficulty: "Novice",
    tags: ["lunge", "bodyweight", "single-leg", "stability"]
  },

  // Level 3 - Intermediate
  {
    id: 'intermediate-tricep-extensions',
    name: "Tricep Extensions",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2-0-1-0",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["pushup", "bodyweight", "standard", "chest"]
  },
  {
    id: 'intermediate-diamond-pushups',
    name: "Diamond Push-ups",
    sets: [{ reps: 15 }, { reps: 15 }, { reps: 15 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["pike", "shoulders", "progression"]
  },
  {
    id: 'intermediate-wide-pushups',
    name: "Wide Push-ups",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["diamond", "triceps", "advanced", "narrow-grip"]
  },
  {
    id: 'intermediate-normal-pushups',
    name: "Normal Push-ups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["diamond", "triceps", "advanced", "narrow-grip"]
  },
  {
    id: 'intermediate-negative-pushups',
    name: "Normal Push-ups",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "4-2",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Push",
    difficulty: "Intermediate",
    tags: ["diamond", "triceps", "advanced", "narrow-grip"]
  },
  {
    id: 'intermediate-trx-pullups-band-assisted',
    name: "TRX Pullups Band Assisted",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "2010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["hang", "grip", "strength", "progression"]
  },
  {
    id: 'intermediate-trx-inverted-row',
    name: "TRX Inverted Row",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["hang", "grip", "strength", "progression"]
  },
  {
    id: 'intermediate-trx-scapula-pullups',
    name: "TRX Scapula Pullups",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "2010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Pull",
    difficulty: "Intermediate",
    tags: ["hang", "grip", "strength", "progression"]
  },
  {
    id: 'intermediate-cossack-squats',
    name: "Cossack Squats",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "2010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["squat", "high-volume", "endurance"]
  },
  {
    id: 'intermediate-bulgarian-split-squats',
    name: "Bulgarian Split Squats",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 90,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["jump", "explosive", "plyometric", "power"]
  },
  {
    id: 'intermediate-narrow-stance-squats',
    name: "Narrow Stance Squats",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["bridge", "single-leg", "glutes", "unilateral"]
  },
  {
    id: 'intermediate-deep-squats',
    name: "Deep Squats",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "3010",
    rest: 60,
    level: 3,
    levelName: "Intermediate",
    category: "Squat",
    difficulty: "Intermediate",
    tags: ["bridge", "single-leg", "glutes", "unilateral"]
  },

  // Level 4 - Advanced
  {
    id: 'advanced-archer-pushups',
    name: "Archer Pushups",
    sets: [{ reps: 2 }, { reps: 2 }, { reps: 2 }],
    tempo: "2-0-1-0",
    rest: 60,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["pushup", "high-volume", "strength-endurance"]
  },
  {
    id: 'advanced-explosive-pushups',
    name: "Explosive Pushups",
    sets: [{ reps: 6 }, { reps: 6 }],
    tempo: "2-0-1-0",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["handstand", "vertical", "shoulders", "advanced"]
  },
  {
    id: 'advanced-diamond-pushups',
    name: "Diamond Pushups",
    sets: [{ reps: 10 }, { reps: 10 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["archer", "unilateral", "advanced", "asymmetric"]
  },
  {
    id: 'advanced-normal-pushups',
    name: "Normal Pushups",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["dips", "triceps", "parallel-bars", "compound"]
  },
  {
    id: 'advanced-plank-hold',
    name: "Plank Hold",
    sets: [{ duration: 60 }, { duration: 60 }, { duration: 60 }],
    tempo: "hold",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Push",
    difficulty: "Advanced",
    tags: ["dips", "triceps", "parallel-bars", "compound"]
  },
  {
    id: 'advanced-trx-negative-pullups',
    name: "TRX Negative Pullups",
    sets: [{ reps: 1 }, { reps: 1 }, { reps: 1 }, { reps: 1 }, { reps: 1 }],
    tempo: "10s",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["pullup", "vertical", "compound", "back"]
  },
  {
    id: 'advanced-trx-pullups-band-assisted',
    name: "TRX Pullups Band Assisted",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "2010",
    rest: 120,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["chinup", "biceps", "supinated", "vertical"]
  },
  {
    id: 'advanced-trx-inverted-row',
    name: "TRX Inverted Row",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["l-hang", "core", "isometric", "advanced"]
  },
  {
    id: 'advanced-trx-passive-hang',
    name: "TRX Passive Hang",
    sets: [{ duration: 30 }, { duration: 30 }, { duration: 30 }],
    tempo: "hold",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["l-hang", "core", "isometric", "advanced"]
  },
  {
    id: 'advanced-trx-scapula-pullups',
    name: "TRX Scapula Pullups",
    sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }],
    tempo: "2010",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Pull",
    difficulty: "Advanced",
    tags: ["l-hang", "core", "isometric", "advanced"]
  },
  {
    id: 'advanced-assisted-pistol-squat',
    name: "Assisted Pistol Squat",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "3010",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["pistol", "single-leg", "advanced", "balance"]
  },
  {
    id: 'advanced-cossack-squats',
    name: "Cossack Squats",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 90,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["pistol", "single-leg", "advanced", "balance"]
  },
  {
    id: 'advanced-trx-bulgarian-split-squats',
    name: "TRX Bulgarian Split Squats",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "2-0-1-0",
    rest: 75,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["bulgarian", "split", "single-leg", "elevated"]
  },
  {
    id: 'advanced-deep-squats',
    name: "Deep Squats",
    sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
    tempo: "3-0-1-0",
    rest: 60,
    level: 4,
    levelName: "Advanced",
    category: "Squat",
    difficulty: "Advanced",
    tags: ["calf", "single-leg", "unilateral", "balance"]
  },

  // Level 5 - Expert
  {
    id: 'expert-one-arm-pushups',
    name: "One Arm Push-ups",
    sets: [{ reps: 1 }, { reps: 1 }, { reps: 1 }],
    tempo: "2010",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["one-arm", "elite", "unilateral", "ultimate"]
  },
  {
    id: 'expert-archer-pushups',
    name: "Archer Push-ups",
    sets: [{ reps: 4 }, { reps: 4 }, { reps: 4 }, { reps: 4 }, { reps: 4 }],
    tempo: "2-0-1-0",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["handstand", "freestanding", "elite", "balance"]
  },
  {
    id: 'expert-normal-pushups',
    name: "Normal Pushups",
    sets: [{ reps: 6 }, { reps: 6 }, { reps: 6 }, { reps: 6 }, { reps: 6 }],
    tempo: "2-0-1-0",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["planche", "elite", "static", "ultimate"]
  },
  {
    id: 'expert-diamond-pushups',
    name: "Ring Dips",
    sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["rings", "unstable", "elite", "stabilization"]
  },
  {
    id: 'expert-wide-pushups',
    name: "Wide Pushups",
    sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }],
    tempo: "2-0-1-0",
    rest: 90,
    level: 5,
    levelName: "Expert",
    category: "Push",
    difficulty: "Expert",
    tags: ["rings", "unstable", "elite", "stabilization"]
  },
  {
    id: 'expert-trx-pullups',
    name: "TRX Pullups",
    sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }],
    tempo: "2-0-1-0",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["pullup", "high-volume", "elite", "endurance"]
  },
  {
    id: 'expert-trx-pullups-band-assisted',
    name: "TRX Pullups Band Assisted",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "2-0-1-0",
    rest: 180,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["muscle-up", "elite", "transition", "ultimate"]
  },
  {
    id: 'expert-trx-inverted-row',
    name: "TRX Inverted Row",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["front-lever", "static", "elite", "core"]
  },
  {
    id: 'expert-trx-scapula-pullups',
    name: "TRX Scapula Pullups",
    sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }],
    tempo: "2010",
    rest: 150,
    level: 5,
    levelName: "Expert",
    category: "Pull",
    difficulty: "Expert",
    tags: ["archer", "unilateral", "elite", "asymmetric"]
  },
  {
    id: 'expert-trx-passive-hang',
    name: "TRX Passive Hang",
    sets: [{ duration: 30 }, { duration: 30 }, { duration: 30 }],
    tempo: "hold",
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
    sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }],
    tempo: "2020",
    rest: 90,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["pistol", "full", "elite", "balance"]
  },
  {
    id: 'expert-trx-assisted-pistol-squats',
    name: "TRX Assisted Pistol Squats",
    sets: [{ reps: 6 }, { reps: 6 }],
    tempo: "3010",
    rest: 120,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["shrimp", "ultimate", "flexibility", "elite"]
  },
  {
    id: 'expert-cossack-squats',
    name: "Cossack Squats",
    sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
    tempo: "2010",
    rest: 75,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["jump", "explosive", "plyometric", "alternating"]
  },
  {
    id: 'expert-trx-bulgarian-split-squats',
    name: "TRX Bulgarian Split Squats",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "2010",
    rest: 75,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["jump", "explosive", "plyometric", "alternating"]
  },
  {
    id: 'expert-deep-squats',
    name: "Deep Squats",
    sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
    tempo: "3010",
    rest: 75,
    level: 5,
    levelName: "Expert",
    category: "Squat",
    difficulty: "Expert",
    tags: ["jump", "explosive", "plyometric", "alternating"]
  }
]

// Helper to convert exercise to base format (strip metadata)
const toBaseExercise = (ex: ExerciseWithMetadata) => ({
  name: ex.name,
  sets: ex.sets,
  tempo: ex.tempo,
  rest: ex.rest,
  equipment: ex.equipment,
  notes: ex.notes,
  category: ex.category
})

// Workout levels organized by difficulty
export const workoutLevels: WorkoutLevels = {
  // foundation: {
  //   name: "Foundation",
  //   description: "Stability, control, and knee-friendly movements",
  //   exercises: {
  //     Push: allExercises.filter(ex => ex.level === 0 && ex.category === 'Push').map(toBaseExercise),
  //     Pull: allExercises.filter(ex => ex.level === 0 && ex.category === 'Pull').map(toBaseExercise),
  //     Squat: allExercises.filter(ex => ex.level === 0 && ex.category === 'Squat').map(toBaseExercise)
  //   }
  // },
  beginner: {
    name: "Beginner",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 1 && ex.category === 'Push').map(toBaseExercise),
      Pull: allExercises.filter(ex => ex.level === 1 && ex.category === 'Pull').map(toBaseExercise),
      Squat: allExercises.filter(ex => ex.level === 1 && ex.category === 'Squat').map(toBaseExercise)
    },
    progressionNotes: {
      Push: "Focus on controlled negatives — aim for a slow 4-second lowering phase before progressing to full push-ups. If you can complete 8 reps for the given sets of negative push-ups, it’s time to progress to Level 2.",
      Pull: "Build grip endurance and scapular awareness. Hold passive hangs for 60s before moving to active pulling. Successfully rowing 66-88lbs for the outlined sets/reps and holding a hang for 60 seconds mark readiness for Level 2.",
      Squat: "Prioritize depth and ankle mobility. Keep heels grounded and work toward full range of motion. If deep squats are hard, skip them and work on mobility. Go to level 2 once you can do entire routine."
    }
  },
  novice: {
    name: "Novice",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 2 && ex.category === 'Push').map(toBaseExercise),
      Pull: allExercises.filter(ex => ex.level === 2 && ex.category === 'Pull').map(toBaseExercise),
      Squat: allExercises.filter(ex => ex.level === 2 && ex.category === 'Squat').map(toBaseExercise)
    },
    progressionNotes: {
      Push: "Maintain full range of motion on standard push-ups. Scapula push-ups should feel controlled at the top. If you can perform 12 reps of regular push-ups, upgrade to Level 3.",
      Pull: "Straighten legs on inverted rows. Scapula pull-ups should show clear retraction and depression. Achieving a nearly horizontal position in Australian pull-ups for the specified sets/reps ushers in progression to Level 3.",
      Squat: "Introduce single-leg stability with Bulgarian squats. Use a slower tempo to build control. After completing 6 reps of Bulgarian split squats, move to level 3."
    }
  },
  intermediate: {
    name: "Intermediate",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 3 && ex.category === 'Push').map(toBaseExercise),
      Pull: allExercises.filter(ex => ex.level === 3 && ex.category === 'Pull').map(toBaseExercise),
      Squat: allExercises.filter(ex => ex.level === 3 && ex.category === 'Squat').map(toBaseExercise)
    },
    progressionNotes: {
      Push: "Train all push-up variations with consistent tempo. Diamond and wide push-ups build the base for one-arm work. Once you can complete the specified sets and reps, proceed to Level 4.",
      Pull: "Band-assisted pull-ups should be strict — no kipping. Reduce band resistance as strength builds. Accomplishing the specified sets/reps using a thin resistance band indicates readiness for Level 4.",
      Squat: "Cossack squats develop lateral mobility. Bulgarian splits should reach parallel depth on every rep. If you can do 6 reps of Cossack squats and the other workouts, start pistol squat variant."
    }
  },
  advanced: {
    name: "Advanced",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 4 && ex.category === 'Push').map(toBaseExercise),
      Pull: allExercises.filter(ex => ex.level === 4 && ex.category === 'Pull').map(toBaseExercise),
      Squat: allExercises.filter(ex => ex.level === 4 && ex.category === 'Squat').map(toBaseExercise)
    },
    progressionNotes: {
      Push: "Archer push-ups train unilateral strength. Keep the straight arm locked and control the full range. After completing the specified sets and reps, and maintaining a full minute plank, it’s time to attempt level 5.",
      Pull: "Negative pull-ups should last 10 seconds minimum. Band-assisted reps should be clean with full extension. Completing 5 single sets of 10 second negatives indicates the ability to perform a pull-up.",
      Squat: "Assisted pistol squats build single-leg strength. Focus on a controlled descent before removing assistance. Pick any pistol squats easier variant. After 10 reps (or 4s eccentric squats), it’s time to try an unassisted pistol squat."
    }
  },
  expert: {
    name: "Expert",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 5 && ex.category === 'Push').map(toBaseExercise),
      Pull: allExercises.filter(ex => ex.level === 5 && ex.category === 'Pull').map(toBaseExercise),
      Squat: allExercises.filter(ex => ex.level === 5 && ex.category === 'Squat').map(toBaseExercise)
    },
    progressionNotes: {
      Push: "One-arm push-ups require total body tension. Keep hips square and lower with full control. Once you can complete the whole routine with the specific sets and reps, aim to increase the number of reps in the OAPU.",
      Pull: "Strict pull-ups with no momentum. Aim for chin clearly over the bar on every rep. If 3 sets of 3 pull-ups are doable, it’s time to try more. For instance, aim for 3 sets of 4 pull-ups next.",
      Squat: "Full pistol squats with no assistance. Maintain heel contact and upright torso throughout. Once you finish the whole level, aim to gradually reach 8 reps of pistol squats."
    }
  }
}
