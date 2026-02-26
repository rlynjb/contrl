'use client'

import type { ExtendedWeekDay } from '@/hooks/useUserData'
import { CATEGORY_COLORS } from '@/lib/constants'
import './WeeklyTracker.css'

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

interface WeeklyTrackerProps {
  weekDays: ExtendedWeekDay[]
}

export default function WeeklyTracker({ weekDays }: WeeklyTrackerProps) {
  const todayIdx = new Date().getDay()
  const getCompletedDots = (day: ExtendedWeekDay): string[] => {
    const dots: string[] = []
    for (const ex of day.exercises || []) {
      if (!(ex.category in CATEGORY_COLORS)) continue
      const count = ex.completedSets?.filter(Boolean).length ?? 0
      for (let i = 0; i < count; i++) dots.push(ex.category)
    }
    return dots
  }

  const workoutDayCount = weekDays.filter(d => getCompletedDots(d).length > 0).length

  return (
    <div className="weekly-tracker">
      {/* Top row: week label + day count */}
      <div className="weekly-tracker__header">
        <div className="weekly-tracker__header-info">
          <span className="weekly-tracker__label">THIS WEEK</span>
          <span className="weekly-tracker__sublabel">{workoutDayCount}/7 days</span>
        </div>
      </div>

      {/* Day columns */}
      <div className="weekly-tracker__days">
        {WEEK_DAYS.map((dayLabel, i) => {
          const day = weekDays[i]
          const dots = day ? getCompletedDots(day) : []
          const hasWorkout = dots.length > 0
          const isToday = i === todayIdx
          const isFuture = i > todayIdx

          return (
            <div key={i} className="weekly-tracker__day">
              <span className={`weekly-tracker__day-label${isToday ? ' weekly-tracker__day-label--today' : ''}`}>
                {dayLabel}
              </span>
              <span className="weekly-tracker__day-date">
                {day ? new Date(day.date).getDate() : ''}
              </span>

              <div className={`weekly-tracker__dot-area${isToday ? ' weekly-tracker__dot-area--today' : ''}`}>
                {hasWorkout ? (
                  <div className="weekly-tracker__dots">
                    {dots.map((cat: string, ci: number) => (
                      <div
                        key={ci}
                        className="weekly-tracker__dot"
                        style={{
                          background: CATEGORY_COLORS[cat]?.color || "#888",
                          boxShadow: `0 0 6px ${CATEGORY_COLORS[cat]?.color || "#888"}50`,
                        }}
                      />
                    ))}
                  </div>
                ) : isFuture ? (
                  <div className="weekly-tracker__dot weekly-tracker__dot--future" />
                ) : (
                  <div className="weekly-tracker__dot weekly-tracker__dot--rest" />
                )}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
