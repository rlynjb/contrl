/**
 * Base interface for all agent types
 */
export interface Agent {
  name: string;
  initialize(): Promise<void>;
}

/**
 * Exercise difficulty level
 */
export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

/**
 * Exercise interface
 */
export interface Exercise {
  id: string;
  name: string;
  description: string;
  difficulty: DifficultyLevel;
  muscleGroups: string[];
  formCues: string[];
  progressions: string[];
  regressions: string[];
}

/**
 * User profile interface
 */
export interface UserProfile {
  id: string;
  name: string;
  level: DifficultyLevel;
  goals: string[];
  currentExercises: string[];
  completedSessions: number;
}

/**
 * Workout session interface
 */
export interface WorkoutSession {
  id: string;
  userId: string;
  exercises: Exercise[];
  date: Date;
  completed: boolean;
  notes: string;
}
