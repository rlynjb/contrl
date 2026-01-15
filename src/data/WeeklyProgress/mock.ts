// WeeklyProgress Mock Data
// Raw data types and mock data for weekly progress tracking

import type { BaseExercise } from '@/types'

export interface WorkoutSession {
  exercises: BaseExercise[]
  duration: number // minutes
  categories: ('Push' | 'Pull' | 'Squat')[]
  level: number
  xpEarned: number
}

export interface WeekDay {
  date: Date
  day: string
  dayNum: number
  completed: boolean
  isToday: boolean
  workoutSession?: WorkoutSession // Completed workout data
  plannedWorkout?: WorkoutSession // What's planned for today/future
}

export interface WeeklyStats {
  completedDays: number
  streakCount: number
  xpEarned: number
  weekCompletion: number // percentage
  totalExercises: number
  favoriteCategory: 'Push' | 'Pull' | 'Squat' | 'Mixed'
}

export interface WeeklyProgressData {
  weekDays: WeekDay[]
  stats: WeeklyStats
  motivationalMessage: string
  achievements: string[]
}

// Sample workout sessions for mock data
const sampleWorkouts: WorkoutSession[] = [
  {
    exercises: [
      {
        name: "Wall Push-ups with Band Resistance",
        sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "Mini band"
      },
      {
        name: "Seated Chest Press with Band",
        sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
        tempo: "3-1-3-1",
        rest: 90,
        equipment: "Resistance band"
      }
    ],
    duration: 25,
    categories: ['Push'],
    level: 0,
    xpEarned: 15
  },
  {
    exercises: [
      {
        name: "Incline Push-ups",
        sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "Elevated surface"
      },
      {
        name: "Assisted Pull-ups with Band",
        sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }],
        tempo: "3-2-3-1",
        rest: 120,
        equipment: "Pull-up bar, resistance band"
      }
    ],
    duration: 30,
    categories: ['Push', 'Pull'],
    level: 1,
    xpEarned: 20
  },
  {
    exercises: [
      {
        name: "Knee Push-ups",
        sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "None"
      },
      {
        name: "Wall Sit",
        sets: [{ duration: 30 }, { duration: 25 }, { duration: 20 }],
        rest: 90,
        equipment: "Wall"
      }
    ],
    duration: 20,
    categories: ['Push', 'Squat'],
    level: 0,
    xpEarned: 15
  },
  {
    exercises: [
      {
        name: "Standard Push-ups",
        sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "None"
      },
      {
        name: "Bodyweight Squats",
        sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "None"
      },
      {
        name: "Pike Push-ups",
        sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }],
        tempo: "3-2-3-1",
        rest: 90,
        equipment: "None"
      }
    ],
    duration: 35,
    categories: ['Push', 'Squat'],
    level: 1,
    xpEarned: 25
  }
]

// Today's planned workout
const todaysPlannedWorkout: WorkoutSession = {
  exercises: [
    {
      name: "Incline Push-ups",
      sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }],
      tempo: "3-2-3-1",
      rest: 90,
      equipment: "Elevated surface",
      notes: "Focus on controlled movement"
    },
    {
      name: "Assisted Squats",
      sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }],
      tempo: "3-2-3-1",
      rest: 90,
      equipment: "TRX or resistance band",
      notes: "Maintain proper form"
    },
    {
      name: "Wall Handstand Hold",
      sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }],
      rest: 120,
      equipment: "Wall",
      notes: "Build up shoulder strength"
    }
  ],
  duration: 30,
  categories: ['Push', 'Squat'],
  level: 1,
  xpEarned: 20
}

// Mock weekly progress data - simulates a realistic workout week
const mockWeeklyProgressData: WeeklyProgressData = {
  weekDays: [], // Will be generated dynamically
  stats: {
    completedDays: 0, // Will be calculated
    streakCount: 0, // Will be calculated
    xpEarned: 0, // Will be calculated
    weekCompletion: 0, // Will be calculated
    totalExercises: 0, // Will be calculated
    favoriteCategory: 'Mixed' // Will be calculated
  },
  motivationalMessage: "",
  achievements: [
    "First workout completed! 💪",
    "3-day streak achieved! 🔥", 
    "Week warrior - 5 days done! 🏆",
    "Perfect week completed! 🎉"
  ]
}

export { mockWeeklyProgressData, sampleWorkouts, todaysPlannedWorkout }
