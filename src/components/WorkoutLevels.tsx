'use client'

import { Badge } from '@/components/ui/badge'
import type {
  BaseExercise,
  BaseExerciseSet,
  WorkoutLevel
} from '@/types'
import { workoutLevels } from '@/lib/mock'

export default function WorkoutLevels() {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-4">
        Progressive calisthenics exercises organized by difficulty levels
      </div>
      
      <div className="space-y-6">
        {workoutLevels.map((level, levelIndex) => (
          <div key={levelIndex} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-lg px-3 py-1">
                Level {levelIndex}
              </Badge>
              <h3 className="text-lg font-semibold">{level.name}</h3>
            </div>
            
            {level.description && (
              <p className="text-sm text-muted-foreground mb-2">{level.description}</p>
            )}
            
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(level.exercises).map(([category, exercises]) => (
                <div key={category} className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    {category}
                  </h4>
                  
                  <div className="space-y-3">
                    {exercises.map((exercise: BaseExercise, exerciseIndex: number) => (
                      <div key={exerciseIndex} className="bg-secondary/30 rounded-md p-3">
                        <h5 className="font-medium text-sm mb-2">{exercise.name}</h5>
                        
                        {exercise.equipment && (
                          <div className="mb-2">
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                              {exercise.equipment}
                            </Badge>
                          </div>
                        )}
                        
                        <div className="space-y-1">
                          {/* Sets, Tempo, and Rest in one line */}
                          <div className="text-xs">
                            <span className="text-muted-foreground">{exercise.sets.length} Sets: </span>
                            <span className="font-medium">
                              {exercise.sets.map((set: BaseExerciseSet, index: number) => 
                                'reps' in set ? set.reps : `${set.duration}s`
                              ).join(' → ')}
                            </span>
                          </div>
                          
                          <div className="text-xs">
                            <span className="text-muted-foreground">Tempo: </span>
                            <span className="font-medium">{exercise.tempo}</span>
                            <span className="text-muted-foreground ml-3">Rest: </span>
                            <span className="font-medium">{exercise.rest}s</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Level Guidelines */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-blue-600">💡</div>
          <div className="text-sm font-medium text-blue-800">Progression Guidelines</div>
        </div>
        <div className="text-xs text-blue-700 space-y-1">
          <p>• <strong>Level 0 (Foundation):</strong> Focus on stability, control, and knee-friendly movements with mini band assistance</p>
          <p>• Complete all exercises in your current level with proper form before advancing</p>
          <p>• Master at least 80% of the target reps/duration for each exercise</p>
          <p>• Focus on quality over quantity - perfect form is essential</p>
          <p>• Rest adequately between workouts (48-72 hours for same muscle groups)</p>
          <p>• If experiencing knee discomfort, start with Level 0 and progress slowly</p>
        </div>
      </div>
    </div>
  )
}
