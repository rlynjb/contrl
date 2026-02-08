'use client'

import { useState, useEffect } from 'react'
import { Badge, ExerciseCard } from '@/components/ui'
import { api } from '@/api'
import type { BaseExercise, WorkoutLevel, UserData, CurrentUserLevels } from '@/api'
import { MOCK_UserData } from '@/mocks'
import './WorkoutLevels.css'

export default function WorkoutLevels() {
  const [ exercises, setExercises ] = useState<Record<string, WorkoutLevel>>({});
  const [ currentLevels, setCurrentLevels ] = useState<CurrentUserLevels>({ Push: 0, Pull: 0, Squat: 0 });

  useEffect(() => {
    const getExercises = async () => {
      const res = await api.exercises.getWorkoutLevels();
      setExercises(res);
    };
    
    getExercises();

    /**
     * TODO:
     * replace this with LevelCalculator logic to determine
     * user's current level based on completed workout's sets, reps, etc.
     */
    const initUserData = async () => {
      let userData = await api.user.getUserData()

      // Initialize with mock data if no user data exists
      if (!userData) {
        userData = await api.user.updateUserData(MOCK_UserData as UserData)
      }

      setCurrentLevels(userData?.currentLevels || { Push: 0, Pull: 0, Squat: 0 })
    }

    initUserData()    
  }, []);
  
  return (
    <div className="workout-levels">
      <div className="workout-levels__description">
        Progressive calisthenics exercises organized by difficulty levels
      </div>
      
      {/* Current Levels Overview */}
      <div className="workout-levels__overview">
        <div className="workout-levels__overview-header">
          <div className="workout-levels__overview-title">Your Current Levels</div>
        </div>
        <div className="workout-levels__overview-grid">
          {Object.entries(currentLevels).map(([category, level]) => (
            <div key={category} className={`workout-levels__overview-item workout-levels__overview-item--${category.toLowerCase()}`}>
              <div className="workout-levels__overview-category">{category}</div>
              <Badge variant="default" className={`workout-levels__overview-badge workout-levels__overview-badge--${category.toLowerCase()}`}>
                Level {level}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      
      <div className="workout-levels__container">
        {(Object.entries(exercises) as [string, WorkoutLevel][]).map(([levelKey, level], levelIndex) => {
          // Check if this is a current level for any category
          const isCurrentLevel = Object.values(currentLevels).includes(levelIndex)
          
          return (
            <div key={levelKey} className={`workout-levels__level-card ${isCurrentLevel ? 'workout-levels__level-card--current' : ''}`}>
              <div className="workout-levels__level-header">
                <Badge variant={isCurrentLevel ? "default" : "outline"} className="workout-levels__level-badge">
                  Level {levelIndex}
                </Badge>
                <h3 className="workout-levels__level-title">{level.name}</h3>
                {isCurrentLevel && (
                  <Badge variant="secondary" className="workout-levels__current-indicator">
                    Current
                  </Badge>
                )}
              </div>
              
              {level.description && (
                <p className="workout-levels__level-description">{level.description}</p>
              )}
              
              <div className="workout-levels__categories-grid">
                {Object.entries(level.exercises).map(([category, exercises]) => {
                  // Check if this category is at current level
                  const isCategoryAtCurrentLevel = currentLevels[category as keyof typeof currentLevels] === levelIndex
                  
                  return (
                    <div key={category} className={`workout-levels__category ${isCategoryAtCurrentLevel ? 'workout-levels__category--current' : ''}`}>
                      <h4 className="workout-levels__category-title">
                        {category}
                        {isCategoryAtCurrentLevel && (
                          <span className="workout-levels__category-indicator">● Current</span>
                        )}
                      </h4>
                      
                      <div className="workout-levels__exercises">
                        {exercises.map((exercise: BaseExercise, exerciseIndex: number) => (
                          <ExerciseCard 
                            key={exerciseIndex} 
                            exercise={exercise}
                            className={`workout-levels__exercise-card ${isCategoryAtCurrentLevel ? 'workout-levels__exercise-card--current' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Level Guidelines */}
      {/* <div className="workout-levels__guidelines">
        <div className="workout-levels__guidelines-header">
          <div className="workout-levels__guidelines-icon">💡</div>
          <div className="workout-levels__guidelines-title">Progression Guidelines</div>
        </div>
        <div className="workout-levels__guidelines-content">
          <p className="workout-levels__guideline-item">• <strong>Level 0 (Foundation):</strong> Focus on stability, control, and knee-friendly movements with mini band assistance</p>
          <p className="workout-levels__guideline-item">• Complete all exercises in your current level with proper form before advancing</p>
          <p className="workout-levels__guideline-item">• Master at least 80% of the target reps/duration for each exercise</p>
          <p className="workout-levels__guideline-item">• Focus on quality over quantity - perfect form is essential</p>
          <p className="workout-levels__guideline-item">• Rest adequately between workouts (48-72 hours for same muscle groups)</p>
          <p className="workout-levels__guideline-item">• If experiencing knee discomfort, start with Level 0 and progress slowly</p>
        </div>
      </div> */}
    </div>
  )
}
