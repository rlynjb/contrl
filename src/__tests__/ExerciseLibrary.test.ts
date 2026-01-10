import { ExerciseLibrary } from '../exercises/ExerciseLibrary';
import { DifficultyLevel } from '../types';

describe('ExerciseLibrary', () => {
  let library: ExerciseLibrary;

  beforeEach(() => {
    library = new ExerciseLibrary();
  });

  it('should create an instance', () => {
    expect(library).toBeInstanceOf(ExerciseLibrary);
  });

  it('should return all exercises', () => {
    const exercises = library.getAllExercises();
    expect(Array.isArray(exercises)).toBe(true);
  });

  it('should filter exercises by difficulty', () => {
    const beginnerExercises = library.getExercisesByDifficulty(DifficultyLevel.BEGINNER);
    expect(Array.isArray(beginnerExercises)).toBe(true);
  });

  it('should return undefined for non-existent exercise', () => {
    const exercise = library.getExercise('non-existent');
    expect(exercise).toBeUndefined();
  });
});
