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
  const workoutDayCount = weekDays.filter(d => d.isWorkoutDay).length

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
          const hasWorkout = day?.isWorkoutDay
          const isToday = i === todayIdx
          const isFuture = i > todayIdx
          const categories = (day?.categories || []) as string[]

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
                    {categories.map((cat, ci) => (
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
