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

// Mock data for current user levels per category
const currentUserLevels = {
  Push: 1,
  Pull: 1,
  Squat: 0
}

export default function CurrentLevel() {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-4">
        Your current level progress across movement categories
      </div>
      
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {Object.entries(currentUserLevels).map(([category, level]) => {
          const levelInfo = workoutLevels[level as keyof typeof workoutLevels]
          const nextLevel = workoutLevels[(level + 1) as keyof typeof workoutLevels]
          
          return (
            <div key={category} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{category}</h3>
                <Badge variant="outline" className="text-base px-3 py-1">
                  Level {level}
                </Badge>
              </div>
              
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Current: </span>
                  <span className="font-medium">{levelInfo.name}</span>
                </div>
                
                {(levelInfo as any).description && (
                  <p className="text-xs text-muted-foreground">{(levelInfo as any).description}</p>
                )}
                
                {(levelInfo as any).equipment && (
                  <Badge variant="secondary" className="text-xs">
                    📦 {(levelInfo as any).equipment}
                  </Badge>
                )}
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Current Exercises:</h4>
                  {levelInfo.exercises[category as keyof typeof levelInfo.exercises]?.map((exercise: any, index: number) => (
                    <div key={index} className="bg-secondary/30 rounded p-2">
                      <div className="text-sm font-medium">{exercise.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {exercise.sets.length} Sets: {exercise.sets.map((set: any) => 
                          'reps' in set ? set.reps : `${set.duration}s`
                        ).join(' → ')}
                      </div>
                    </div>
                  ))}
                </div>
                
                {nextLevel && (
                  <div className="pt-2 border-t">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Next: </span>
                      <span className="font-medium text-blue-600">Level {level + 1} - {nextLevel.name}</span>
                    </div>
                  </div>
                )}
                
                {!nextLevel && (
                  <div className="pt-2 border-t">
                    <Badge variant="default" className="text-xs bg-gold text-gold-foreground">
                      🏆 Max Level Achieved
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Progress Summary */}
      <div className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-blue-600">📊</div>
          <h3 className="font-semibold text-lg">Progress Summary</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Overall Level: </span>
              <span className="font-medium">
                {Math.round((currentUserLevels.Push + currentUserLevels.Pull + currentUserLevels.Squat) / 3 * 10) / 10}
              </span>
            </div>
            
            <div className="text-sm">
              <span className="text-muted-foreground">Strongest Area: </span>
              <span className="font-medium text-green-600">
                {Object.entries(currentUserLevels).reduce((a, b) => currentUserLevels[a[0] as keyof typeof currentUserLevels] > currentUserLevels[b[0] as keyof typeof currentUserLevels] ? a : b)[0]}
              </span>
            </div>
            
            <div className="text-sm">
              <span className="text-muted-foreground">Focus Area: </span>
              <span className="font-medium text-orange-600">
                {Object.entries(currentUserLevels).reduce((a, b) => currentUserLevels[a[0] as keyof typeof currentUserLevels] < currentUserLevels[b[0] as keyof typeof currentUserLevels] ? a : b)[0]}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Total Progression: </span>
              <span className="font-medium">
                {Math.round((currentUserLevels.Push + currentUserLevels.Pull + currentUserLevels.Squat) / 15 * 100)}%
              </span>
            </div>
            
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentUserLevels.Push + currentUserLevels.Pull + currentUserLevels.Squat) / 15 * 100}%` }}
              ></div>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Progress to mastery (Level 5 in all categories)
            </div>
          </div>
        </div>
      </div>
      
      {/* Recommendations */}
      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-green-600">💡</div>
          <div className="text-sm font-medium text-green-800">Personalized Recommendations</div>
        </div>
        <div className="text-xs text-green-700 space-y-1">
          {currentUserLevels.Squat === 0 && (
            <p>• Start with Level 0 Squat exercises focusing on stability and mini band assistance</p>
          )}
          {Math.min(...Object.values(currentUserLevels)) < Math.max(...Object.values(currentUserLevels)) && (
            <p>• Focus on balancing your weakest area ({Object.entries(currentUserLevels).reduce((a, b) => currentUserLevels[a[0] as keyof typeof currentUserLevels] < currentUserLevels[b[0] as keyof typeof currentUserLevels] ? a : b)[0]}) to improve overall strength</p>
          )}
          <p>• Master your current level exercises before advancing to prevent injury</p>
          <p>• Consider working with your AI coach to create a balanced progression plan</p>
        </div>
      </div>
    </div>
  )
}
