'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ChatInterface from '@/components/chat/ChatInterface'

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

function ExerciseHistory() {
  const [showHistory, setShowHistory] = useState(true)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">💪 Exercise Progress</CardTitle>
        </div>
        <div className="flex items-center gap-1 w-full">
          <button
            onClick={() => setShowHistory(true)}
            className={`flex-1 px-2 py-1 rounded-md text-xs transition-all ${
              showHistory 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Last Session
          </button>
          <button
            onClick={() => setShowHistory(false)}
            className={`flex-1 px-2 py-1 rounded-md text-xs transition-all ${
              !showHistory 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Today's Plan
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showHistory ? (
          /* Last Workout - Compact Version */
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {mockLastWorkout.date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric' 
              })} • {mockLastWorkout.duration} min
            </div>
            {mockLastWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{exercise.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {exercise.sets.filter(s => s.completed).length}/{exercise.sets.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {exercise.sets.map((set, setIndex) => (
                    <div key={setIndex} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Set {setIndex + 1}</span>
                      <div className="flex items-center gap-2">
                        <span>
                          {'reps' in set ? `${set.reps}` : `${set.duration}s`}
                        </span>
                        {set.completed ? (
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        ) : (
                          <div className="w-2 h-2 border border-orange-300 rounded-full"></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Today's Workout - Compact Version */
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Today's targets based on last session
            </div>
            {mockTodaysWorkout.exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{exercise.name}</h4>
                  <Badge className="text-xs bg-blue-100 text-blue-800">
                    {exercise.targetSets.length} sets
                  </Badge>
                </div>
                
                <div className="p-2 bg-blue-50 rounded text-xs">
                  <div className="text-blue-800">{exercise.progression}</div>
                </div>

                <div className="space-y-1">
                  {exercise.targetSets.map((set, setIndex) => (
                    <div key={setIndex} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Set {setIndex + 1}</span>
                      <div className="flex items-center gap-2">
                        <span>
                          {'reps' in set ? `${set.reps}` : `${set.duration}s`}
                        </span>
                        <div className="w-2 h-2 border border-yellow-300 rounded-full bg-yellow-50"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <div className="p-3 bg-green-50 rounded border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-green-600">💡</div>
                <div className="text-sm font-medium text-green-800">Ready to start?</div>
              </div>
              <p className="text-xs text-green-700">
                Chat with your AI coach to begin today's session!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
const generateWeeklyProgress = () => {
  const today = new Date()
  const weekDays = []
  
  // Get the past 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    
    // Deterministic completion based on date (to avoid hydration mismatch)
    // Use day of month to create consistent pattern
    const dayNum = date.getDate()
    const completed = (dayNum % 3 !== 0) && i !== 0 && i !== 1 // Skip today and yesterday, pattern based on date
    
    weekDays.push({
      date,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: dayNum,
      completed,
      isToday: i === 0,
    })
  }
  
  return weekDays
}

function WeeklyProgress() {
  const [weekDays, setWeekDays] = useState<any[]>([])
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    setWeekDays(generateWeeklyProgress())
  }, [])

  // Don't render until client-side to avoid hydration mismatch
  if (!isClient || weekDays.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                📅 Weekly Progress
              </CardTitle>
              <CardDescription>
                Loading your weekly progress...
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">-</div>
              <div className="text-sm text-muted-foreground">Day Streak</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="flex flex-col items-center p-3 rounded-lg border-2 border-border bg-card animate-pulse"
              >
                <div className="text-xs text-muted-foreground mb-1">-</div>
                <div className="text-sm font-medium mb-2">-</div>
                <div className="flex items-center justify-center w-6 h-6">
                  <div className="w-3 h-3 border-2 border-muted-foreground/30 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const completedDays = weekDays.filter(day => day.completed).length
  const reversedWeekDays = [...weekDays].reverse() // Create a copy for display
  const currentStreak = reversedWeekDays.findIndex(day => !day.completed)
  const streakCount = currentStreak === -1 ? weekDays.length - 1 : currentStreak // Exclude today from streak count

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              📅 Weekly Progress
            </CardTitle>
            <CardDescription>
              {completedDays}/7 workouts completed this week
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{streakCount}</div>
            <div className="text-sm text-muted-foreground">Day Streak</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {reversedWeekDays.map((day, index) => (
            <div
              key={index}
              className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                day.isToday
                  ? 'border-primary bg-primary/10'
                  : day.completed
                    ? 'border-green-200 bg-green-50'
                    : 'border-border bg-card'
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">{day.day}</div>
              <div className="text-sm font-medium mb-2">{day.dayNum}</div>
              <div className="flex items-center justify-center w-6 h-6">
                {day.completed ? (
                  <div className="text-green-600 text-lg">✓</div>
                ) : day.isToday ? (
                  <div className="w-3 h-3 bg-primary rounded-full"></div>
                ) : (
                  <div className="w-3 h-3 border-2 border-muted-foreground/30 rounded-full"></div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Quick Stats */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="flex items-center gap-1">
              � {streakCount} day streak
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              💪 {completedDays * 15} XP earned
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {completedDays === 7 
              ? "Perfect week! 🎉" 
              : `${7 - completedDays} more to complete the week`
            }
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Welcome back! 👋</h1>
        <p className="text-muted-foreground">
          Ready for your next calisthenics session? Let's keep building that strength!
        </p>
      </div>

      {/* Weekly Progress */}
      <WeeklyProgress />

      {/* Main Dashboard Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chat Interface - Takes up 2/3 of the width */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="h-[600px]">
                <ChatInterface />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel - Exercise Progress */}
        <div className="space-y-6">
          <ExerciseHistory />
        </div>
      </div>
    </div>
  )
}
