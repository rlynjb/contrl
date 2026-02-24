'use client'

import type { ExtendedWeekDay } from '@/hooks/useUserData'
import './WeeklyTracker.css'

const CATS: Record<string, { color: string }> = {
  Push:  { color: "#F97316" },
  Pull:  { color: "#06B6D4" },
  Squat: { color: "#D946EF" },
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

interface WeeklyTrackerProps {
  weekDays: ExtendedWeekDay[]
}

export default function WeeklyTracker({ weekDays }: WeeklyTrackerProps) {
  const todayIdx = new Date().getDay()
  const workoutDayCount = weekDays.filter(d => d.isWorkoutDay).length

  const weekSets = weekDays.reduce((acc, d) => {
    if (!d.exercises) return acc
    return acc + d.exercises.reduce((s, ex) => s + (ex.sets?.length || 0), 0)
  }, 0)

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

              <div className={`weekly-tracker__dot-area${isToday ? ' weekly-tracker__dot-area--today' : ''}`}>
                {hasWorkout ? (
                  <div className="weekly-tracker__dots">
                    {categories.map((cat, ci) => (
                      <div
                        key={ci}
                        className="weekly-tracker__dot"
                        style={{
                          background: CATS[cat]?.color || "#888",
                          boxShadow: `0 0 6px ${CATS[cat]?.color || "#888"}50`,
                        }}
                      />
                    ))}
                  </div>
                ) : isFuture ? (
                  <div className="weekly-tracker__dot weekly-tracker__dot--future" />
                ) : (
                  <div className="weekly-tracker__dot weekly-tracker__dot--rest" />
                )}

                {hasWorkout && day?.exercises && (
                  <span className="weekly-tracker__sets-count">
                    {day.exercises.reduce((s, ex) => s + (ex.sets?.length || 0), 0)}s
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Weekly totals bar */}
      <div className="weekly-tracker__totals">
        <div className="weekly-tracker__total-group">
          <span className="weekly-tracker__total-label">SETS</span>
          <span className="weekly-tracker__total-value">{weekSets}</span>
        </div>
        <div className="weekly-tracker__spacer" />
        {Object.entries(CATS).map(([key, c]) => {
          const daysTrained = weekDays.filter(d => ((d.categories || []) as string[]).includes(key)).length
          if (!daysTrained) return null
          return (
            <div key={key} className="weekly-tracker__cat-item">
              <div className="weekly-tracker__cat-dot" style={{ background: c.color }} />
              <span className="weekly-tracker__cat-count" style={{ color: c.color + "90" }}>
                &times;{daysTrained}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
