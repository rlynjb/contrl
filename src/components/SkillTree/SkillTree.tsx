'use client'

import { useState, useMemo } from 'react'
import type { CurrentUserLevels, WorkoutLevel, BaseExercise, ProgressionNotes } from '@/api'
import './SkillTree.css'

const CATS: Record<string, { label: string; icon: string; color: string; bg: string; border: string; glow: string }> = {
  Push:  { label: "PUSH",  icon: "\u2197", color: "#F97316", bg: "#F9731610", border: "#F9731628", glow: "0 0 24px #F9731635" },
  Pull:  { label: "PULL",  icon: "\u2199", color: "#06B6D4", bg: "#06B6D410", border: "#06B6D428", glow: "0 0 24px #06B6D435" },
  Squat: { label: "SQUAT", icon: "\u2193", color: "#D946EF", bg: "#D946EF10", border: "#D946EF28", glow: "0 0 24px #D946EF35" },
}

const LEVEL_MAP: Record<string, { lv: number; name: string }> = {
  beginner:     { lv: 1, name: "Beginner" },
  novice:       { lv: 2, name: "Novice" },
  intermediate: { lv: 3, name: "Intermediate" },
  advanced:     { lv: 4, name: "Advanced" },
  expert:       { lv: 5, name: "Expert" },
}

const LEVEL_ORDER = ["beginner", "novice", "intermediate", "advanced", "expert"]

interface Skill {
  id: string
  cat: string
  lv: number
  name: string
  sets: string
  tempo: string
  rest: number
  done: boolean
  open: boolean
}

interface SkillTreeProps {
  currentLevels: CurrentUserLevels | null
  workoutLevels: Record<string, WorkoutLevel>
}

// Convert API workout levels to flat skill list
function buildSkills(
  workoutLevels: Record<string, WorkoutLevel>,
  currentLevels: CurrentUserLevels | null
): Skill[] {
  const skills: Skill[] = []

  for (const levelKey of LEVEL_ORDER) {
    const level = workoutLevels[levelKey]
    if (!level) continue
    const lvInfo = LEVEL_MAP[levelKey]

    for (const [category, exercises] of Object.entries(level.exercises)) {
      const userLevel = currentLevels?.[category as keyof CurrentUserLevels] ?? 1
      const isAtOrBelowLevel = lvInfo.lv <= userLevel

      for (const exercise of exercises as BaseExercise[]) {
        const setsStr = exercise.sets
          .map(s => s.duration ? `${s.duration}s` : String(s.reps || 0))
          .join(', ')
        const setCount = exercise.sets.length

        skills.push({
          id: `${levelKey}-${exercise.name.toLowerCase().replace(/\s+/g, '-')}`,
          cat: category,
          lv: lvInfo.lv,
          name: exercise.name,
          sets: `${setCount}\u00d7${setsStr.split(', ')[0] || ''}`,
          tempo: exercise.tempo || '',
          rest: exercise.rest || 0,
          done: lvInfo.lv < userLevel, // levels below current are "done"
          open: isAtOrBelowLevel,
        })
      }
    }
  }

  return skills
}

// ── Progress Ring ──
function ProgressRing({ done, total, color, size = 34 }: { done: number; total: number; color: string; size?: number }) {
  const s = 2.5, r = (size - s) / 2, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#141420" strokeWidth={s} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
        strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done/total : 0))}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  )
}

// ── Level Marker ──
function LevelMarker({ lv, filled, color }: { lv: number; filled: boolean; color: string }) {
  return (
    <div style={{
      position: "absolute", left: -11, top: 16,
      width: 24, height: 24, borderRadius: "50%", zIndex: 3,
      background: filled ? color : "#0c0c16",
      border: `2.5px solid ${filled ? color : "#222234"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 900, color: filled ? "#fff" : "#3a3a50",
      fontFamily: "'Anybody', monospace",
      boxShadow: filled ? `0 0 12px ${color}40` : "none",
      transition: "all 0.3s ease",
    }}>{lv}</div>
  )
}

// ── Skill Card ──
function SkillCard({ skill, cat, isOpen, onTap }: {
  skill: Skill
  cat: typeof CATS[string]
  isOpen: boolean
  onTap: () => void
}) {
  const locked = !skill.open
  return (
    <div onClick={() => !locked && onTap()} style={{
      marginBottom: 8, borderRadius: 14,
      border: `1.5px solid ${isOpen ? cat.color + "50" : locked ? "#12121e" : "#181828"}`,
      background: locked ? "#0a0a14" : isOpen ? `linear-gradient(160deg, ${cat.bg}, #0c0c18 70%)` : "#0c0c18",
      opacity: locked ? 0.35 : 1,
      overflow: "hidden", cursor: locked ? "default" : "pointer",
      transition: "all 0.3s ease",
      boxShadow: isOpen ? cat.glow : "none",
      WebkitTapHighlightColor: "transparent",
    }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
          background: skill.done ? cat.color : "transparent",
          border: `2px solid ${skill.done ? cat.color : skill.open ? cat.color + "50" : "#252530"}`,
          boxShadow: skill.done ? `0 0 6px ${cat.color}50` : "none",
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 700, color: locked ? "#333" : "#d4d4dc",
            fontFamily: "'Anybody', sans-serif", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{skill.name}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: locked ? "#1e1e2a" : "#484860",
          fontFamily: "'Anybody', monospace", flexShrink: 0,
        }}>{skill.sets}</span>
        {locked && <span style={{ fontSize: 13, opacity: 0.2, flexShrink: 0 }}>&#128274;</span>}
        {skill.done && (
          <div style={{
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
            background: cat.color, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#fff", fontWeight: 900, boxShadow: `0 2px 6px ${cat.color}40`,
          }}>&check;</div>
        )}
        {!locked && !skill.done && (
          <svg width="16" height="16" viewBox="0 0 16 16" style={{
            opacity: 0.2, flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}>
            <path d="M4 6l4 4 4-4" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {isOpen && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${cat.color}18, transparent)`, marginBottom: 12 }} />
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px",
            fontSize: 11, fontFamily: "'Anybody', monospace", marginBottom: 14,
          }}>
            <div>
              <span style={{ color: "#3a3a50", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>SETS</span>
              <div style={{ color: "#aaa", marginTop: 2 }}>{skill.sets}</div>
            </div>
            <div>
              <span style={{ color: "#3a3a50", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>TEMPO</span>
              <div style={{ color: "#aaa", marginTop: 2 }}>{skill.tempo || "\u2014"}</div>
            </div>
            <div>
              <span style={{ color: "#3a3a50", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>REST</span>
              <div style={{ color: "#aaa", marginTop: 2 }}>{skill.rest ? `${skill.rest}s` : "None"}</div>
            </div>
          </div>
          {skill.done && (
            <div style={{
              textAlign: "center", padding: "8px 0", fontSize: 10, fontWeight: 800,
              color: cat.color, fontFamily: "'Anybody', monospace",
              letterSpacing: "0.14em", opacity: 0.6,
            }}>&loz; COMPLETED &loz;</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main SkillTree ──
export default function SkillTree({ currentLevels, workoutLevels }: SkillTreeProps) {
  const [tab, setTab] = useState<string>("Push")
  const [openId, setOpenId] = useState<string | null>(null)
  const [collapsedLevels, setCollapsedLevels] = useState<Record<number, boolean>>({})

  const skills = useMemo(() => buildSkills(workoutLevels, currentLevels), [workoutLevels, currentLevels])

  const cat = CATS[tab]
  const catSkills = skills.filter(s => s.cat === tab)
  const catDone = catSkills.filter(s => s.done).length
  const catTotal = catSkills.length
  const allDone = skills.filter(s => s.done).length
  const allTotal = skills.length

  const toggleLevel = (lv: number) => {
    setCollapsedLevels(prev => ({ ...prev, [lv]: !prev[lv] }))
    setOpenId(null)
  }

  // Get progression notes for a level + category
  const getNote = (levelKey: string, category: string): string | undefined => {
    return workoutLevels[levelKey]?.progressionNotes?.[category as keyof ProgressionNotes]
  }

  return (
    <div style={{
      width: "100%",
      background: "#08080f", color: "#e0e0e0",
      fontFamily: "'Anybody', -apple-system, sans-serif", overflowX: "hidden",
    }}>
      {/* Sticky Header (tabs) */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "#08080f", borderBottom: "1px solid #12121e",
      }}>
        <div style={{
          padding: "12px 20px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ProgressRing done={allDone} total={allTotal} color="#888" size={36} />
              <span style={{ position: "absolute", fontSize: 9, fontWeight: 800, color: "#666", fontFamily: "'Anybody', monospace" }}>
                {allTotal ? Math.round((allDone/allTotal)*100) : 0}%
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "12px 20px 12px" }}>
          {Object.entries(CATS).map(([key, c]) => {
            const active = key === tab
            const d = skills.filter(s => s.cat === key && s.done).length
            const t = skills.filter(s => s.cat === key).length
            return (
              <button key={key} onClick={() => { setTab(key); setOpenId(null) }} style={{
                flex: 1, padding: "9px 0 8px", borderRadius: 12,
                border: active ? `1.5px solid ${c.color}40` : "1.5px solid #14141e",
                background: active ? c.bg : "transparent",
                cursor: "pointer", transition: "all 0.2s ease",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                WebkitTapHighlightColor: "transparent",
              }}>
                <span style={{ fontSize: 14, lineHeight: 1, opacity: active ? 1 : 0.3 }}>{c.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: active ? c.color : "#3a3a4a", fontFamily: "'Anybody', monospace" }}>{c.label}</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: active ? c.color+"80" : "#252530", fontFamily: "'Anybody', monospace" }}>{d}/{t}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Category progress */}
      <div style={{ padding: "6px 20px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, fontFamily: "'Anybody', monospace", letterSpacing: "0.08em" }}>{cat.label} PROGRESS</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#3a3a50", fontFamily: "'Anybody', monospace" }}>{catDone}/{catTotal}</span>
        </div>
        <div style={{ width: "100%", height: 4, borderRadius: 2, background: "#141420", overflow: "hidden" }}>
          <div style={{
            width: `${catTotal ? (catDone/catTotal)*100 : 0}%`, height: "100%", borderRadius: 2,
            background: `linear-gradient(90deg, ${cat.color}, ${cat.color}aa)`,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding: "0 20px 100px", position: "relative" }}>
        <div style={{
          position: "absolute", left: 30, top: 0, bottom: 60,
          width: 2, borderRadius: 1,
          background: `linear-gradient(180deg, ${cat.color}25, ${cat.color}04)`,
        }} />

        {LEVEL_ORDER.map(levelKey => {
          const lvInfo = LEVEL_MAP[levelKey]
          const lvSkills = catSkills.filter(s => s.lv === lvInfo.lv)
          if (!lvSkills.length) return null

          const lvDone = lvSkills.filter(s => s.done).length
          const lvTotal = lvSkills.length
          const allLvDone = lvDone === lvTotal
          const anyDone = lvDone > 0
          const anyOpen = lvSkills.some(s => s.open)
          const isCollapsed = collapsedLevels[lvInfo.lv]
          const note = getNote(levelKey, tab)

          return (
            <div key={lvInfo.lv} style={{ position: "relative", paddingLeft: 30, marginBottom: 12 }}>
              <LevelMarker lv={lvInfo.lv} filled={anyDone} color={cat.color} />

              <div onClick={() => toggleLevel(lvInfo.lv)} style={{
                paddingLeft: 20, marginBottom: isCollapsed ? 0 : 10,
                cursor: "pointer", WebkitTapHighlightColor: "transparent",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
                    color: anyDone ? cat.color : anyOpen ? cat.color + "60" : "#222234",
                    fontFamily: "'Anybody', monospace",
                  }}>LEVEL {lvInfo.lv}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "#2a2a3a",
                    fontFamily: "'Anybody', sans-serif", marginLeft: 8,
                  }}>{lvInfo.name}</span>
                  {allLvDone && <span style={{ marginLeft: 8, fontSize: 9, color: cat.color, opacity: 0.5, fontWeight: 800 }}>&check; CLEAR</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: anyDone ? cat.color + "80" : "#222234",
                    fontFamily: "'Anybody', monospace",
                  }}>{lvDone}/{lvTotal}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" style={{
                    opacity: 0.25,
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}>
                    <path d="M4 5l3 3 3-3" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {!isCollapsed && (
                <div style={{ paddingLeft: 20 }}>
                  {note && (
                    <div style={{
                      fontSize: 11, color: "#3a3a50", lineHeight: 1.5,
                      fontFamily: "'Anybody', sans-serif",
                      padding: "8px 12px", marginBottom: 10,
                      borderLeft: `2px solid ${cat.color}20`,
                      borderRadius: "0 6px 6px 0", background: "#0a0a12",
                    }}>{note}</div>
                  )}
                  {lvSkills.map(skill => (
                    <SkillCard key={skill.id} skill={skill} cat={cat}
                      isOpen={openId === skill.id}
                      onTap={() => setOpenId(openId === skill.id ? null : skill.id)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ position: "relative", paddingLeft: 30 }}>
          <div style={{
            position: "absolute", left: 19, top: 0, width: 24, height: 24, borderRadius: "50%",
            border: "2px dashed #1e1e30", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: "#2a2a3a",
          }}>&starf;</div>
          <span style={{
            fontSize: 10, color: "#1e1e30", fontFamily: "'Anybody', monospace",
            fontWeight: 700, letterSpacing: "0.1em", paddingLeft: 24,
          }}>MASTERY</span>
        </div>
      </div>
    </div>
  )
}
