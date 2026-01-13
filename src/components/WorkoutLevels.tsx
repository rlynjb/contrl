'use client'

import { Badge } from '@/components/ui/badge'

// Mock data for workout levels - Progressive calisthenics exercises
const workoutLevels = {
  0: {
    name: "Foundation",
    description: "Stability, control, and knee-friendly movements",
    equipment: "Mini band required",
    exercises: {
      Push: [
        { name: "Wall Push-ups with Band Resistance", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "3-2-3-1", rest: 90, equipment: "Mini band around back" },
        { name: "Seated Chest Press (Band)", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 60, equipment: "Mini band" },
        { name: "Standing Band Pull-Apart", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 45, equipment: "Mini band" }
      ],
      Pull: [
        { name: "Seated Band Rows", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 60, equipment: "Mini band" },
        { name: "Band-Assisted Dead Hang", sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }], tempo: "hold", rest: 90, equipment: "Mini band for assistance" },
        { name: "Lat Pulldowns (Band)", sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }], tempo: "2-1-2-1", rest: 75, equipment: "Mini band overhead" }
      ],
      Squat: [
        { name: "Supported Squats (Band)", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "3-2-3-1", rest: 90, equipment: "Mini band for support" },
        { name: "Seated Leg Extensions (Band)", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 60, equipment: "Mini band around ankles" },
        { name: "Standing Hip Abduction (Band)", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-1-1", rest: 45, equipment: "Mini band around ankles" },
        { name: "Glute Bridges (Band)", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 60, equipment: "Mini band around knees" }
      ]
    }
  },
  1: {
    name: "Beginner",
    exercises: {
      Push: [
        { name: "Wall Push-ups", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Incline Push-ups", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 60 }
      ],
      Pull: [
        { name: "Dead Hang", sets: [{ duration: 10 }, { duration: 8 }], tempo: "hold", rest: 60 },
        { name: "Inverted Rows (High Bar)", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Squat: [
        { name: "Chair Assisted Squats", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Calf Raises", sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }], tempo: "2-1-1-1", rest: 45 }
      ]
    }
  },
  2: {
    name: "Novice",
    exercises: {
      Push: [
        { name: "Knee Push-ups", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Pike Push-ups", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Pull: [
        { name: "Dead Hang", sets: [{ duration: 20 }, { duration: 15 }, { duration: 10 }], tempo: "hold", rest: 60 },
        { name: "Inverted Rows", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Squat: [
        { name: "Bodyweight Squats", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Lunges", sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }], tempo: "2-1-2-1", rest: 60 }
      ]
    }
  },
  3: {
    name: "Intermediate",
    exercises: {
      Push: [
        { name: "Push-ups", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Pike Push-ups", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 90 },
        { name: "Diamond Push-ups", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Pull: [
        { name: "Dead Hang", sets: [{ duration: 30 }, { duration: 25 }, { duration: 20 }], tempo: "hold", rest: 60 },
        { name: "Negative Pull-ups", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "1-1-5-1", rest: 120 },
        { name: "Inverted Rows", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Squat: [
        { name: "Bodyweight Squats", sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Jump Squats", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-X-1", rest: 90 },
        { name: "Single Leg Glute Bridges", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 60 }
      ]
    }
  },
  4: {
    name: "Advanced",
    exercises: {
      Push: [
        { name: "Push-ups", sets: [{ reps: 15 }, { reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-2-1", rest: 60 },
        { name: "Handstand Push-ups (Wall)", sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }], tempo: "2-1-2-1", rest: 120 },
        { name: "Archer Push-ups", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 90 },
        { name: "Dips", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Pull: [
        { name: "Pull-ups", sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }], tempo: "2-1-2-1", rest: 120 },
        { name: "Chin-ups", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 120 },
        { name: "L-Hang", sets: [{ duration: 15 }, { duration: 12 }, { duration: 10 }], tempo: "hold", rest: 90 }
      ],
      Squat: [
        { name: "Pistol Squat Progression", sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }], tempo: "2-1-2-1", rest: 90 },
        { name: "Bulgarian Split Squats", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 75 },
        { name: "Single Leg Calf Raises", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-1-1", rest: 60 }
      ]
    }
  },
  5: {
    name: "Expert",
    exercises: {
      Push: [
        { name: "One Arm Push-up Progression", sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }], tempo: "2-1-2-1", rest: 150 },
        { name: "Handstand Push-ups", sets: [{ reps: 6 }, { reps: 5 }, { reps: 4 }], tempo: "2-1-2-1", rest: 120 },
        { name: "Planche Push-ups", sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }], tempo: "2-1-2-1", rest: 150 },
        { name: "Ring Dips", sets: [{ reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 90 }
      ],
      Pull: [
        { name: "Pull-ups", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }, { reps: 6 }], tempo: "2-1-2-1", rest: 120 },
        { name: "Muscle-ups", sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }], tempo: "2-1-2-1", rest: 180 },
        { name: "Front Lever Progression", sets: [{ duration: 10 }, { duration: 8 }, { duration: 6 }], tempo: "hold", rest: 120 },
        { name: "Archer Pull-ups", sets: [{ reps: 4 }, { reps: 3 }, { reps: 2 }], tempo: "2-1-2-1", rest: 150 }
      ],
      Squat: [
        { name: "Pistol Squats", sets: [{ reps: 8 }, { reps: 6 }, { reps: 5 }], tempo: "2-1-2-1", rest: 90 },
        { name: "Shrimp Squats", sets: [{ reps: 3 }, { reps: 2 }, { reps: 2 }], tempo: "2-1-2-1", rest: 120 },
        { name: "Jump Lunges", sets: [{ reps: 12 }, { reps: 10 }, { reps: 8 }], tempo: "2-1-X-1", rest: 75 }
      ]
    }
  }
}

export default function WorkoutLevels() {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-4">
        Progressive calisthenics exercises organized by difficulty levels
      </div>
      
      <div className="space-y-6">
        {Object.entries(workoutLevels).map(([levelNum, level]) => (
          <div key={levelNum} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-lg px-3 py-1">
                Level {levelNum}
              </Badge>
              <h3 className="text-lg font-semibold">{level.name}</h3>
            </div>
            
            {(level as any).description && (
              <p className="text-sm text-muted-foreground mb-2">{(level as any).description}</p>
            )}
            
            {(level as any).equipment && (
              <div className="mb-4">
                <Badge variant="secondary" className="text-xs">
                  📦 {(level as any).equipment}
                </Badge>
              </div>
            )}
            
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(level.exercises).map(([category, exercises]) => (
                <div key={category} className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    {category}
                  </h4>
                  
                  <div className="space-y-3">
                    {exercises.map((exercise, exerciseIndex) => (
                      <div key={exerciseIndex} className="bg-secondary/30 rounded-md p-3">
                        <h5 className="font-medium text-sm mb-2">{exercise.name}</h5>
                        
                        {(exercise as any).equipment && (
                          <div className="mb-2">
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                              {(exercise as any).equipment}
                            </Badge>
                          </div>
                        )}
                        
                        <div className="space-y-1">
                          {/* Sets, Tempo, and Rest in one line */}
                          <div className="text-xs">
                            <span className="text-muted-foreground">{exercise.sets.length} Sets: </span>
                            <span className="font-medium">
                              {exercise.sets.map((set, index) => 
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
