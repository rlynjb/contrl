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
  onDayClick: (day: ExtendedWeekDay) => void
}

export default function WeeklyTracker({ weekDays, onDayClick }: WeeklyTrackerProps) {
  const todayIdx = new Date().getDay()
  const workoutDayCount = weekDays.filter(d => d.isWorkoutDay).length

  // Compute weekly totals from exercises
  const weekSets = weekDays.reduce((acc, d) => {
    if (!d.exercises) return acc
    return acc + d.exercises.reduce((s, ex) => s + (ex.sets?.length || 0), 0)
  }, 0)

  return (
    <div style={{
      background: "#0c0c16",
      borderBottom: "1px solid #14141e",
      padding: "14px 20px 16px",
    }}>
      {/* Top row: week label + day count */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="weekly-tracker__label">THIS WEEK</span>
          <span className="weekly-tracker__sublabel">{workoutDayCount}/7 days</span>
        </div>
      </div>

      {/* Day columns */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4,
      }}>
        {WEEK_DAYS.map((dayLabel, i) => {
          const day = weekDays[i]
          const hasWorkout = day?.isWorkoutDay
          const isToday = i === todayIdx
          const isFuture = i > todayIdx
          const categories = (day?.categories || []) as string[]

          return (
            <div
              key={i}
              onClick={() => day && onDayClick(day)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                cursor: "pointer", WebkitTapHighlightColor: "transparent",
              }}
            >
              {/* Day label */}
              <span className="weekly-tracker__day-label" style={{
                color: isToday ? "#e0e0e0" : "#333340",
              }}>{dayLabel}</span>

              {/* Dot area */}
              <div style={{
                width: 36, minHeight: 36,
                borderRadius: 10,
                background: isToday ? "#14142a" : "transparent",
                border: isToday ? "1px solid #222240" : "1px solid transparent",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 3, padding: "5px 0",
                transition: "all 0.2s ease",
              }}>
                {hasWorkout ? (
                  <div style={{ display: "flex", gap: 3 }}>
                    {categories.map((cat, ci) => (
                      <div key={ci} style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: CATS[cat]?.color || "#888",
                        boxShadow: `0 0 6px ${CATS[cat]?.color || "#888"}50`,
                      }} />
                    ))}
                  </div>
                ) : isFuture ? (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    border: "1.5px dashed #1e1e2e",
                  }} />
                ) : (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#1a1a28",
                  }} />
                )}

                {/* Sets count under dot */}
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
      <div style={{
        display: "flex", gap: 16, marginTop: 12,
        paddingTop: 10,
        borderTop: "1px solid #12121e",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="weekly-tracker__total-label">SETS</span>
          <span className="weekly-tracker__total-value">{weekSets}</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Mini category breakdown */}
        {Object.entries(CATS).map(([key, c]) => {
          const daysTrained = weekDays.filter(d => ((d.categories || []) as string[]).includes(key)).length
          if (!daysTrained) return null
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: c.color + "90", fontFamily: "'Anybody', monospace" }}>&times;{daysTrained}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
