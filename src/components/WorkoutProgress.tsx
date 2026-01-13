'use client'

import { Badge } from '@/components/ui/badge'

// Mock data for exercise history and current workout
const mockLastWorkout = {
  date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
  duration: 18,
  exercises: [
    {
      name: "Push-ups",
      sets: [
        { reps: 8, tempo: "2-1-2-1", rest: 60, completed: true },
        { reps: 6, tempo: "2-1-2-1", rest: 60, completed: true },
        { reps: 5, tempo: "2-1-2-1", rest: 60, completed: true }
      ]
    },
    {
      name: "Pike Push-ups",
      sets: [
        { reps: 5, tempo: "2-1-2-1", rest: 90, completed: true },
        { reps: 4, tempo: "2-1-2-1", rest: 90, completed: true },
        { reps: 3, tempo: "2-1-2-1", rest: 90, completed: false }
      ]
    },
    {
      name: "Plank Hold",
      sets: [
        { duration: 45, tempo: "hold", rest: 60, completed: true },
        { duration: 35, tempo: "hold", rest: 60, completed: true }
      ]
    }
  ]
}

const mockTodaysWorkout = {
  exercises: [
    {
      name: "Push-ups",
      targetSets: [
        { reps: 10, tempo: "2-1-2-1", rest: 60 },
        { reps: 8, tempo: "2-1-2-1", rest: 60 },
        { reps: 6, tempo: "2-1-2-1", rest: 60 }
      ],
      progression: "Increase reps by 2 from last session"
    },
    {
      name: "Pike Push-ups", 
      targetSets: [
        { reps: 6, tempo: "2-1-2-1", rest: 90 },
        { reps: 5, tempo: "2-1-2-1", rest: 90 },
        { reps: 4, tempo: "2-1-2-1", rest: 90 }
      ],
      progression: "Focus on completing all sets"
    },
    {
      name: "Plank Hold",
      targetSets: [
        { duration: 50, tempo: "hold", rest: 60 },
        { duration: 45, tempo: "hold", rest: 60 }
      ],
      progression: "Hold 5 seconds longer than last time"
    }
  ]
}

export default function WorkoutProgress() {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-4">
        Your workout progress: last session results and today's targets
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* Last Session Column */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="outline" className="text-base px-3 py-1">
              📋 Last Session
            </Badge>
            <div className="text-sm text-muted-foreground">
              {mockLastWorkout.date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric' 
              })} • {mockLastWorkout.duration} min
            </div>
          </div>
          
          <div className="space-y-3">
            {mockLastWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="bg-secondary/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">{exercise.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {exercise.sets.filter(s => s.completed).length}/{exercise.sets.length}
                  </Badge>
                </div>
                
                <div className="space-y-1">
                  {/* Sets, Tempo, and Rest in one line */}
                  <div className="text-xs">
                    <span className="text-muted-foreground">{exercise.sets.length} Sets: </span>
                    <span className="font-medium">
                      {exercise.sets.map((set, index) => {
                        const value = 'reps' in set ? set.reps : `${set.duration}s`
                        return set.completed ? `${value}✓` : `${value}✗`
                      }).join(' → ')}
                    </span>
                  </div>
                  
                  <div className="text-xs">
                    <span className="text-muted-foreground">Tempo: </span>
                    <span className="font-medium">{exercise.sets[0].tempo}</span>
                    <span className="text-muted-foreground ml-3">Rest: </span>
                    <span className="font-medium">{exercise.sets[0].rest}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Plan Column */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="outline" className="text-base px-3 py-1">
              🎯 Today's Plan
            </Badge>
            <div className="text-sm text-muted-foreground">
              Based on your progress
            </div>
          </div>
          
          <div className="space-y-3">
            {mockTodaysWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="bg-blue-50/50 rounded-lg p-3">
                <div className="mb-2">
                  <h4 className="font-medium text-sm">{exercise.name}</h4>
                </div>
                
                <div className="space-y-1">
                  {/* Sets, Tempo, and Rest in one line */}
                  <div className="text-xs">
                    <span className="text-muted-foreground">{exercise.targetSets.length} Sets: </span>
                    <span className="font-medium">
                      {exercise.targetSets.map((set, index) => 
                        'reps' in set ? set.reps : `${set.duration}s`
                      ).join(' → ')}
                    </span>
                  </div>
                  
                  <div className="text-xs">
                    <span className="text-muted-foreground">Tempo: </span>
                    <span className="font-medium">{exercise.targetSets[0].tempo}</span>
                    <span className="text-muted-foreground ml-3">Rest: </span>
                    <span className="font-medium">{exercise.targetSets[0].rest}s</span>
                  </div>
                </div>
                
                <div className="mt-2 p-2 bg-blue-100/50 rounded text-xs">
                  <div className="text-xs text-blue-600 font-medium mb-1">PROGRESSION NOTE</div>
                  <div className="text-blue-800">{exercise.progression}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Progress Comparison */}
      <div className="border rounded-lg p-4 bg-gradient-to-r from-green-50 to-blue-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-blue-600">📈</div>
          <h3 className="font-semibold text-lg">Progress Comparison</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mockTodaysWorkout.exercises.map((todayExercise, index) => {
            const lastExercise = mockLastWorkout.exercises.find(ex => ex.name === todayExercise.name)
            if (!lastExercise) return null
            
            const lastTotal = lastExercise.sets.reduce((sum, set) => {
              return sum + ('reps' in set ? set.reps : set.duration)
            }, 0)
            
            const todayTotal = todayExercise.targetSets.reduce((sum, set) => {
              return sum + ('reps' in set ? set.reps : set.duration)
            }, 0)
            
            const improvement = todayTotal - lastTotal
            const improvementPercent = Math.round((improvement / lastTotal) * 100)
            
            return (
              <div key={index} className="bg-white/50 rounded p-3">
                <div className="text-sm font-medium mb-2">{todayExercise.name}</div>
                <div className="space-y-1">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Last: </span>
                    <span className="font-medium">{lastTotal}</span>
                    <span className="text-muted-foreground ml-2">Target: </span>
                    <span className="font-medium">{todayTotal}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {improvement > 0 ? (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-700">
                        +{improvement} ({improvementPercent > 0 ? `+${improvementPercent}` : improvementPercent}%)
                      </Badge>
                    ) : improvement < 0 ? (
                      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700">
                        {improvement} ({improvementPercent}%)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Maintain
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Workout Tips */}
      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-green-600">💡</div>
          <div className="text-sm font-medium text-green-800">Today's Workout Tips</div>
        </div>
        <div className="text-xs text-green-700 space-y-1">
          <p>• Focus on completing all planned sets with proper form</p>
          <p>• If you can't hit the target reps, maintain good form and do what you can</p>
          <p>• Rest adequately between sets - don't rush the workout</p>
          <p>• Chat with your AI coach if you need form guidance or modifications</p>
        </div>
      </div>
    </div>
  )
}
