import type { WorkoutLevels } from './types'
import { allExercises } from './mock'

// Workout levels using the original structure but sourced from our exercise data
export const workoutLevels: WorkoutLevels = {
  foundation: {
    name: "Foundation",
    description: "Stability, control, and knee-friendly movements",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 0 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 0 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 0 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  beginner: {
    name: "Beginner",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 1 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 1 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 1 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  novice: {
    name: "Novice",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 2 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 2 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 2 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  intermediate: {
    name: "Intermediate",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 3 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 3 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 3 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  advanced: {
    name: "Advanced",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 4 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 4 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 4 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  },
  expert: {
    name: "Expert",
    exercises: {
      Push: allExercises.filter(ex => ex.level === 5 && ex.category === 'Push').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Pull: allExercises.filter(ex => ex.level === 5 && ex.category === 'Pull').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      })),
      Squat: allExercises.filter(ex => ex.level === 5 && ex.category === 'Squat').map(ex => ({
        name: ex.name,
        sets: ex.sets,
        tempo: ex.tempo,
        rest: ex.rest,
        equipment: ex.equipment,
        notes: ex.notes
      }))
    }
  }
}