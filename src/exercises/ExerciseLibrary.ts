import { Exercise, DifficultyLevel } from '../types';

/**
 * Exercise library containing all available exercises
 */
export class ExerciseLibrary {
  private exercises: Map<string, Exercise> = new Map();

  constructor() {
    this.initializeExercises();
  }

  /**
   * Initialize the exercise library with basic exercises
   */
  private initializeExercises(): void {
    // TODO: Load exercises from a data source
    // This is a placeholder for the foundation
  }

  /**
   * Get an exercise by ID
   */
  public getExercise(id: string): Exercise | undefined {
    return this.exercises.get(id);
  }

  /**
   * Get all exercises for a difficulty level
   */
  public getExercisesByDifficulty(difficulty: DifficultyLevel): Exercise[] {
    return Array.from(this.exercises.values()).filter(
      (exercise) => exercise.difficulty === difficulty
    );
  }

  /**
   * Get all exercises
   */
  public getAllExercises(): Exercise[] {
    return Array.from(this.exercises.values());
  }
}
