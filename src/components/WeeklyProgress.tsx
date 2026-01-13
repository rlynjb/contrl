'use client'

import { useState, useEffect } from 'react'
import { CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

export default function WeeklyProgress() {
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

  return (
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
  )
}
