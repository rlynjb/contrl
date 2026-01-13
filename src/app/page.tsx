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

// Mock data for weekly progress - deterministic based on date
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

function ConsolidatedProgress() {
  const [activeTab, setActiveTab] = useState('progress')
  const [weekDays, setWeekDays] = useState<any[]>([])
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    setWeekDays(generateWeeklyProgress())
  }, [])

  const completedDays = weekDays.filter(day => day.completed).length
  const reversedWeekDays = [...weekDays].reverse()
  const currentStreak = reversedWeekDays.findIndex(day => !day.completed)
  const streakCount = currentStreak === -1 ? weekDays.length - 1 : currentStreak

  const tabs = [
    { id: 'progress', label: '📅 Weekly Progress' },
    { id: 'last', label: '📋 Last Session' },
    { id: 'today', label: '🎯 Today\'s Plan' }
  ]

  return (
    <Card className="mb-6">
      <CardHeader>
        {/* Tab Navigation */}
        <div className="flex items-center justify-center border-b">
          <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Weekly Progress Tab */}
        {activeTab === 'progress' && (
          <div>
            {!isClient || weekDays.length === 0 ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <CardDescription>Loading your weekly progress...</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">-</div>
                    <div className="text-sm text-muted-foreground">Day Streak</div>
                  </div>
                </div>
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
              </div>
            ) : (
              <div>
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
                      🔥 {streakCount} day streak
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
              </div>
            )}
          </div>
        )}

        {/* Last Session Tab */}
        {activeTab === 'last' && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              {mockLastWorkout.date.toLocaleDateString('en-US', { 
                weekday: 'long',
                month: 'short', 
                day: 'numeric' 
              })} • {mockLastWorkout.duration} minutes
            </div>
            <div className="space-y-4">
              {mockLastWorkout.exercises.map((exercise, exerciseIndex) => (
                <div key={exerciseIndex} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">
                    {exercise.name}
                  </h4>
                  <div className="space-y-2">
                    {/* Sets, Tempo, and Rest in one line */}
                    <div className="text-sm">
                      <span className="text-muted-foreground">{exercise.sets.length} Sets: </span>
                      <span className="font-medium">
                        {exercise.sets.map((set, index) => {
                          const value = 'reps' in set ? set.reps : `${set.duration}s`
                          return set.completed ? `${value}✓` : `${value}✗`
                        }).join(' → ')}
                      </span>
                      <span className="text-muted-foreground ml-4">Tempo: </span>
                      <span className="font-medium">{exercise.sets[0].tempo}</span>
                      <span className="text-muted-foreground ml-4">Rest: </span>
                      <span className="font-medium">{exercise.sets[0].rest}s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Plan Tab */}
        {activeTab === 'today' && (
          <div>
            <div className="text-sm text-muted-foreground mb-4">
              Based on your progress from last session
            </div>
            <div className="space-y-4">
              {mockTodaysWorkout.exercises.map((exercise, exerciseIndex) => (
                <div key={exerciseIndex} className="border rounded-lg p-4">
                  <div className="mb-3">
                    <h4 className="font-medium">{exercise.name}</h4>
                  </div>

                  <div className="space-y-2">
                    {/* Sets, Tempo, and Rest in one line */}
                    <div className="text-sm">
                      <span className="text-muted-foreground">{exercise.targetSets.length} Sets: </span>
                      <span className="font-medium">
                        {exercise.targetSets.map((set, index) => 
                          'reps' in set ? set.reps : `${set.duration}s`
                        ).join(' → ')}
                      </span>
                      <span className="text-muted-foreground ml-4">Tempo: </span>
                      <span className="font-medium">{exercise.targetSets[0].tempo}</span>
                      <span className="text-muted-foreground ml-4">Rest: </span>
                      <span className="font-medium">{exercise.targetSets[0].rest}s</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-2 rounded-md">
                    <div className="text-xs text-blue-600 font-medium mb-1">PROGRESSION NOTE</div>
                    <div className="text-sm text-blue-800">{exercise.progression}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Consolidated Progress */}
      <ConsolidatedProgress />

      {/* Chat Interface */}
      <Card>
        <CardContent className="p-0">
          <div className="h-[600px]">
            <ChatInterface />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
