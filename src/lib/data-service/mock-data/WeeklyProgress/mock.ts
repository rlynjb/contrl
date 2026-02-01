// WeeklyProgress Mock Data
// Raw data types and mock data for weekly progress tracking

import type { BaseExercise } from '@/types'
import type { WorkoutSession, WeekDay, WeeklyProgressData } from './types'

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
    date: new Date('2026-01-12T09:30:00') // Monday
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
    date: new Date('2026-01-13T07:00:00') // Tuesday
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
    date: new Date('2026-01-11T10:15:00') // Saturday
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
    date: new Date('2026-01-11T08:45:00') // Sunday
  }
]

//Today's planned workout
const todaysTodayWorkout: WorkoutSession = {
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
  date: new Date('2026-01-15T18:00:00') // Today - planned for evening
}

export { sampleWorkouts, todaysTodayWorkout }
