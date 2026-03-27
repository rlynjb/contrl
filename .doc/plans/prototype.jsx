---
title: prototype
category: plans
scope: project
---
import { useState, useEffect } from "react";
import { Flame, Check, ChevronRight, ChevronDown, Lock, Home, GitBranch, Clock, ArrowLeft, PartyPopper, X, Minus, Circle, Camera, ArrowUpRight, ArrowDownRight, Lightbulb, ExternalLink, Play, Pause, Square, SkipForward, RotateCcw } from "lucide-react";

const colors = {
  bg: "#06080f", surface: "#0c1021", surfaceLight: "#121830",
  primary: "#00e5ff", primaryDim: "rgba(0,229,255,0.15)",
  emerald: "#34d399", emeraldDim: "rgba(52,211,153,0.15)",
  amber: "#fbbf24", amberDim: "rgba(251,191,36,0.15)",
  muted: "#6b8aab", mutedDim: "rgba(107,138,171,0.12)", mutedBorder: "rgba(107,138,171,0.25)",
  textPrimary: "#e2e8f0", textSecondary: "#64748b",
  border: "#1e293b", gridLine: "rgba(0,229,255,0.04)",
};

const catColors = {
  push: { accent: "#f97316", dim: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.3)", label: "PUSH" },
  pull: { accent: "#00e5ff", dim: "rgba(0,229,255,0.15)", border: "rgba(0,229,255,0.3)", label: "PULL" },
  squat: { accent: "#d946ef", dim: "rgba(217,70,239,0.15)", border: "rgba(217,70,239,0.3)", label: "SQUAT" },
};

const MOCK_USER = { levels: { push: 3, pull: 1, squat: 2 } };
const MOCK_WEEK = { sessionsCompleted: { push: true, pull: false, squat: true } };
const MOCK_STREAK = 3;

const MOCK_GATES = {
  push: [
    { level: 1, status: "passed", consecutivePasses: 3 },
    { level: 2, status: "passed", consecutivePasses: 3 },
    { level: 3, status: "in-progress", consecutivePasses: 2 },
    { level: 4, status: "locked", consecutivePasses: 0 },
    { level: 5, status: "locked", consecutivePasses: 0 },
  ],
  pull: [
    { level: 1, status: "in-progress", consecutivePasses: 0 },
    { level: 2, status: "locked", consecutivePasses: 0 },
    { level: 3, status: "locked", consecutivePasses: 0 },
    { level: 4, status: "locked", consecutivePasses: 0 },
    { level: 5, status: "locked", consecutivePasses: 0 },
  ],
  squat: [
    { level: 1, status: "passed", consecutivePasses: 3 },
    { level: 2, status: "in-progress", consecutivePasses: 1 },
    { level: 3, status: "locked", consecutivePasses: 0 },
    { level: 4, status: "locked", consecutivePasses: 0 },
    { level: 5, status: "locked", consecutivePasses: 0 },
  ],
};

const EXERCISES = {
  push: { 3: [
    { id: "full-pushup", name: "Full Push-up", targetSets: 3, targetReps: 8, isHold: false },
    { id: "diamond-pushup", name: "Diamond Push-up", targetSets: 3, targetReps: 5, isHold: false },
    { id: "full-plank", name: "Full Plank", targetSets: 3, targetReps: 30, isHold: true },
  ]},
  pull: { 1: [
    { id: "dead-hang", name: "Dead Hang", targetSets: 3, targetReps: 15, isHold: true },
    { id: "band-pulldown", name: "Band Pull-down", targetSets: 3, targetReps: 10, isHold: false },
    { id: "inverted-row-high", name: "Inverted Row (High)", targetSets: 3, targetReps: 8, isHold: false },
  ]},
  squat: { 2: [
    { id: "bodyweight-squat", name: "Bodyweight Squat", targetSets: 3, targetReps: 12, isHold: false },
    { id: "split-squat", name: "Split Squat", targetSets: 3, targetReps: 8, isHold: false },
    { id: "wall-sit", name: "Wall Sit", targetSets: 3, targetReps: 30, isHold: true },
  ]},
};

const LAST_SESSION = {
  push: { 3: { "full-pushup": [8, 8, 7], "diamond-pushup": [5, 5, 4], "full-plank": [30, 28, 25] } },
  pull: { 1: { "dead-hang": [15, 12, 10], "band-pulldown": [10, 10, 9], "inverted-row-high": [8, 7, 6] } },
  squat: { 2: { "bodyweight-squat": [12, 12, 11], "split-squat": [8, 8, 7], "wall-sit": [30, 28, 25] } },
};

const PROGRESSION_GUIDE = {
  "full-pushup": { tip: "Keep elbows at 45°, not flared out", next: "Archer Push-up", regress: "Incline Push-up", video: "#" },
  "diamond-pushup": { tip: "Hands together under chest, squeeze triceps at top", next: "Pseudo Planche Push-up", regress: "Full Push-up", video: "#" },
  "full-plank": { tip: "Squeeze glutes and brace core — don't let hips sag", next: "RKC Plank", regress: "Knee Plank", video: "#" },
  "dead-hang": { tip: "Active shoulders — pull shoulder blades down slightly", next: "Scapular Pulls", regress: "Flexed Arm Hang", video: "#" },
  "band-pulldown": { tip: "Drive elbows to hips, squeeze lats at bottom", next: "Negative Pull-up", regress: "Lighter Band", video: "#" },
  "inverted-row-high": { tip: "Pull to chest, keep body straight like a plank", next: "Inverted Row (Low)", regress: "Inverted Row (Higher)", video: "#" },
  "bodyweight-squat": { tip: "Knees track over toes, chest stays upright", next: "Bulgarian Split Squat", regress: "Assisted Squat", video: "#" },
  "split-squat": { tip: "90° both knees at bottom, front shin vertical", next: "Bulgarian Split Squat", regress: "Bodyweight Squat", video: "#" },
  "wall-sit": { tip: "Thighs parallel to floor, back flat against wall", next: "Single Leg Wall Sit", regress: "Higher Wall Sit", video: "#" },
};

const MOCK_HISTORY = [
  { week: "Mar 3 – Mar 9", weekProgress: { push: true, pull: false, squat: true }, sessions: [
    { date: "Mon", category: "push", level: 3, passed: true, consecutiveAfter: 2, percentage: 100, exercises: [
      { name: "Full Push-up", hit: true, pct: 100 }, { name: "Diamond Push-up", hit: true, pct: 100 }, { name: "Full Plank", hit: true, pct: 100 },
    ]},
    { date: "Wed", category: "squat", level: 2, passed: false, consecutiveAfter: 0, percentage: 89, exercises: [
      { name: "Bodyweight Squat", hit: true, pct: 100 }, { name: "Split Squat", hit: false, pct: 96 }, { name: "Wall Sit", hit: false, pct: 92 },
    ]},
  ]},
];

// ─── SHARED ──────────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const c = catColors[category];
  return <span style={{ background: c.dim, color: c.accent, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 0, fontFamily: "var(--font-mono)" }}>{c.label}</span>;
}

function ProgressBar({ value, max, color, height = 4 }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div style={{ height, borderRadius: 0, background: colors.border, overflow: "hidden" }}>
      <div style={{ height: "100%", width: pct + "%", borderRadius: 0, background: color || colors.primary, boxShadow: "none", transition: "width 0.5s ease" }} />
    </div>
  );
}

function SetCheckbox({ checked, status, onClick }) {
  const h = checked && status === "hit", m = checked && status === "miss";
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: h ? colors.emeraldDim : m ? colors.mutedDim : "transparent",
      border: "2px solid " + (h ? colors.emerald : m ? colors.muted : colors.border),
      cursor: "pointer", transition: "all 0.2s ease",
    }}>
      {checked ? (h ? <Check size={14} color={colors.emerald} strokeWidth={3} /> : <Minus size={14} color={colors.muted} strokeWidth={3} />) : null}
    </button>
  );
}

function NodeBadge({ gate, categoryColor, size = 48, onClick }) {
  const p = gate.status === "passed", l = gate.status === "locked", ip = gate.status === "in-progress" && gate.consecutivePasses > 0;
  return (
    <div onClick={!l ? onClick : undefined} style={{
      width: size, height: size, borderRadius: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: p ? categoryColor + "18" : l ? "rgba(30,41,59,0.5)" : categoryColor + "0a",
      border: "2px solid " + (p ? categoryColor : l ? colors.border : categoryColor + "60"),
      boxShadow: "none",
      cursor: l ? "default" : "pointer", opacity: l ? 0.35 : 1, transition: "all 0.3s ease", position: "relative", fontFamily: "var(--font-display)",
    }}>
      {p ? <Check size={20} color={categoryColor} strokeWidth={3} /> : l ? <Lock size={14} color={colors.textSecondary} /> : <span style={{ fontSize: 15, fontWeight: 800, color: categoryColor }}>{gate.level}</span>}
      {ip && <span style={{ position: "absolute", bottom: -7, fontSize: 8, fontWeight: 700, color: categoryColor, background: colors.bg, padding: "1px 5px", borderRadius: 0, border: "1px solid " + categoryColor + "40", fontFamily: "var(--font-mono)" }}>{gate.consecutivePasses}/3</span>}
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────

// Mock: which days had sessions this week (Sun=0 through Sat=6)
const MOCK_WEEK_DAYS = [
  null,                          // Sun — rest
  { category: "push", level: 3 }, // Mon — push
  null,                          // Tue — rest
  { category: "squat", level: 2 },// Wed — squat
  null,                          // Thu — rest (today)
  null,                          // Fri — upcoming
  null,                          // Sat — upcoming
];
const TODAY_INDEX = 4; // Thursday

function HomeScreen({ onNavigateLog }) {
  const categories = ["push", "pull", "squat"];
  const getGate = cat => MOCK_GATES[cat].find(g => g.status !== "passed") || MOCK_GATES[cat][MOCK_GATES[cat].length - 1];
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const doneCats = new Set(MOCK_WEEK_DAYS.filter(Boolean).map(d => d.category));
  const remainingCats = categories.filter(c => !doneCats.has(c));

  return (
    <div style={{ padding: "0 20px 100px" }}>
      {/* ─── WEEKLY OVERVIEW ─── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 12 }}>
          THIS WEEK
        </div>

        {/* 7-day strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, maxWidth: 320, margin: "0 auto" }}>
          {dayLabels.map((label, i) => {
            const session = MOCK_WEEK_DAYS[i];
            const isToday = i === TODAY_INDEX;
            const isPast = i < TODAY_INDEX;
            const hasSession = !!session;
            const cc = hasSession ? catColors[session.category] : null;

            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                {/* Day label */}
                <div style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: "0.05em",
                  fontFamily: "var(--font-mono)",
                  color: hasSession ? cc.accent : isToday ? colors.primary : colors.textSecondary,
                }}>
                  {label}
                </div>

                {/* Single solid box */}
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: hasSession ? cc.accent : colors.surfaceLight,
                  border: isToday && !hasSession ? "1px solid rgba(0,229,255,0.25)" : "none",
                  transition: "all 0.2s ease",
                }} />

                {/* Category label */}
                <div style={{
                  fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
                  color: hasSession ? cc.accent : "transparent",
                  height: 10,
                }}>
                  {hasSession ? cc.label : ""}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* ─── REMAINING CATEGORIES (tappable) ─── */}
      {remainingCats.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 10 }}>
            REMAINING
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {remainingCats.map(cat => {
              const level = MOCK_USER.levels[cat];
              const gate = getGate(cat);
              const cc = catColors[cat];
              const exCount = (EXERCISES[cat]?.[level] || []).length;
              return (
                <div key={cat} onClick={() => onNavigateLog(cat)} style={{
                  background: colors.surface, border: "1px solid " + cc.border,
                  padding: "16px 18px", cursor: "pointer", transition: "all 0.2s ease",
                  boxShadow: "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                        background: cc.dim, border: "1px solid " + cc.border,
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-display)", color: cc.accent }}>L{level}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary, fontFamily: "var(--font-display)", textTransform: "uppercase" }}>{cat}</div>
                        <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>{exCount} exercises · ~15 min</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {gate.consecutivePasses > 0 && (
                        <span style={{ fontSize: 10, color: colors.amber, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{gate.consecutivePasses}/3</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: cc.accent, fontFamily: "var(--font-mono)" }}>L{level}</span>
                      <ChevronRight size={16} color={cc.accent} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── COMPLETED CATEGORIES ─── */}
      {doneCats.size > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 10 }}>
            COMPLETED
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.filter(c => doneCats.has(c)).map(cat => {
              const level = MOCK_USER.levels[cat];
              const cc = catColors[cat];
              const sessionDay = MOCK_WEEK_DAYS.findIndex(d => d?.category === cat);
              const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][sessionDay];
              return (
                <div key={cat} style={{
                  background: colors.surface, border: "1px solid " + colors.border,
                  padding: "14px 18px", opacity: 0.6,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                        background: colors.emeraldDim, border: "1px solid rgba(52,211,153,0.25)",
                      }}>
                        <Check size={18} color={colors.emerald} strokeWidth={3} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary, fontFamily: "var(--font-display)", textTransform: "uppercase" }}>{cat}</div>
                        <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>Logged {dayName} · Level {level}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cc.accent, fontFamily: "var(--font-mono)" }}>L{level}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOG SCREEN ──────────────────────────────────────────────────────────────

function LogScreen({ category, onBack, onCamera }) {
  const [phase, setPhase] = useState("form");
  const [entries, setEntries] = useState({});
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState(null);
  const [expandedGuide, setExpandedGuide] = useState(null);

  const cc = catColors[category];
  const level = MOCK_USER.levels[category];
  const exercises = EXERCISES[category]?.[level] || [];

  useEffect(() => {
    const lastData = LAST_SESSION[category]?.[level] || {};
    const pf = {}, pc = {};
    exercises.forEach(ex => {
      pf[ex.id] = lastData[ex.id] ? [...lastData[ex.id]] : Array(ex.targetSets).fill(0);
      pc[ex.id] = Array(ex.targetSets).fill(false);
    });
    setEntries(pf); setChecked(pc);
  }, [category]);

  const updateSet = (eid, si, v) => setEntries(p => ({ ...p, [eid]: Object.assign([...(p[eid] || [])], { [si]: parseInt(v) || 0 }) }));
  const toggleCheck = (eid, si) => setChecked(p => ({ ...p, [eid]: Object.assign([...(p[eid] || [])], { [si]: !p[eid]?.[si] }) }));
  const getSetStatus = (eid, si, t) => !checked[eid]?.[si] ? "pending" : (entries[eid]?.[si] || 0) >= t ? "hit" : "miss";
  const getExProg = ex => { let d = 0; for (let i = 0; i < ex.targetSets; i++) if (checked[ex.id]?.[i] && (entries[ex.id]?.[i] || 0) >= ex.targetReps) d++; return { done: d, total: ex.targetSets, allHit: d === ex.targetSets }; };

  const handleSave = () => {
    let allClean = true, tR = 0, tT = 0;
    const exR = exercises.map(ex => {
      const s = entries[ex.id] || [], ch = checked[ex.id] || [], t = ex.targetReps;
      let eR = 0, eT = t * ex.targetSets;
      const hit = ch.every((c, i) => c && s[i] >= t) && ch.length === ex.targetSets;
      if (!hit) allClean = false;
      ch.forEach((c, i) => { if (c) eR += Math.min(s[i] || 0, t) });
      tR += eR; tT += eT;
      const short = ch.map((c, i) => !c ? { set: i + 1, type: "unchecked" } : s[i] < t ? { set: i + 1, got: s[i], needed: t, type: "short" } : null).filter(Boolean);
      return { name: ex.name, hit, percentage: Math.round((eR / eT) * 100), shortSets: short, isHold: ex.isHold };
    });
    const gate = MOCK_GATES[category].find(g => g.level === level);
    const nc = allClean ? (gate?.consecutivePasses || 0) + 1 : 0;
    setResult({ passed: allClean, consecutiveAfter: Math.min(nc, 3), gatePassed: nc >= 3, exercises: exR, overallPercentage: Math.round((tR / tT) * 100) });
    setPhase("result");
  };

  const msg = (p, c, g) => g ? "You own this level." : c ? "Clean session — keep this up." : p >= 90 ? "Almost there — so close to a clean session." : p >= 75 ? "Solid work — a few more reps and you've got it." : p >= 50 ? "Good effort — you're building toward it." : "Every rep counts — keep showing up.";

  if (phase === "result" && result) {
    const ic = result.passed, ig = result.gatePassed, hc = ig ? colors.emerald : ic ? colors.primary : colors.amber;
    return (
      <div style={{ padding: "0 20px 40px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: colors.textSecondary, fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer", padding: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={14} /> Home
        </button>

        <div style={{ textAlign: "center", padding: "28px 20px", borderRadius: 0, background: ig ? "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(0,229,255,0.08))" : colors.surface, border: "1px solid " + (ig ? colors.emerald + "40" : ic ? colors.primary + "25" : colors.amber + "20"), marginBottom: 20 }}>
          {ig && <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><PartyPopper size={32} color={colors.emerald} /></div>}
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)", color: hc, marginBottom: 6 }}>{ig ? "GATE PASSED" : ic ? "ALL TARGETS HIT" : "SESSION LOGGED"}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}><CategoryBadge category={category} /><span style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>LEVEL {level}</span></div>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "var(--font-display)", color: hc, lineHeight: 1 }}>{result.overallPercentage}%</div>
          <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 4, marginBottom: 10 }}>overall completion</div>
          <div style={{ maxWidth: 180, margin: "0 auto", marginBottom: 12 }}><ProgressBar value={result.overallPercentage} max={100} color={hc} height={5} /></div>
          <div style={{ fontSize: 13, color: colors.textPrimary, fontFamily: "var(--font-display)", fontWeight: 600 }}>{msg(result.overallPercentage, ic, ig)}</div>
          {ig ? <div style={{ fontSize: 13, color: colors.emerald, fontFamily: "var(--font-mono)", marginTop: 10 }}>3/3 · {category.toUpperCase()} → L{level + 1}</div> : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 0, background: ic ? colors.primaryDim : colors.amberDim, marginTop: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)", color: ic ? colors.primary : colors.amber }}>{result.consecutiveAfter}/3</span>
              <span style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>{ic ? "toward gate" : "clean sessions needed"}</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 8 }}>EXERCISE BREAKDOWN</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {result.exercises.map((ex, i) => (
            <div key={i} style={{ padding: "12px 14px", background: colors.surface, borderRadius: 0, border: "1px solid " + colors.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-display)", color: colors.textPrimary }}>{ex.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--font-display)", color: ex.hit ? colors.emerald : colors.amber }}>{ex.percentage}%</span>
              </div>
              <ProgressBar value={ex.percentage} max={100} color={ex.hit ? colors.emerald : colors.amber} height={4} />
              {!ex.hit && ex.shortSets.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {ex.shortSets.map((s, j) => <div key={j} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: s.type === "unchecked" ? colors.textSecondary : colors.amber }}>{s.type === "unchecked" ? "Set " + s.set + ": not logged" : "Set " + s.set + ": " + s.got + (ex.isHold ? "s" : "") + " → " + (s.needed - s.got) + " " + (ex.isHold ? "sec" : "rep") + (s.needed - s.got !== 1 ? "s" : "") + " to go"}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={onBack} style={{ width: "100%", padding: "14px", borderRadius: 0, background: colors.primaryDim, border: "1px solid rgba(0,229,255,0.25)", color: colors.primary, fontSize: 13, fontWeight: 700, fontFamily: "var(--font-display)", cursor: "pointer", letterSpacing: "0.05em" }}>BACK TO HOME</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: colors.textSecondary, fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> Home</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CategoryBadge category={category} />
          <span style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>LEVEL {level}</span>
        </div>
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, color: colors.textPrimary, fontFamily: "var(--font-display)", marginBottom: 20 }}>Log Workout</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {exercises.map(ex => {
          const prog = getExProg(ex);
          return (
            <div key={ex.id} style={{ paddingBottom: 16, borderBottom: "1px solid " + colors.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, fontFamily: "var(--font-display)" }}>{ex.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>{ex.isHold ? "Hold" : "Reps"}</span>
                    <span style={{ fontSize: 10, color: colors.border }}>|</span>
                    <span style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>{ex.isHold ? "Steady" : "2-1-2-0"}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: cc.accent, fontFamily: "var(--font-display)", lineHeight: 1 }}>{ex.targetSets}×{ex.targetReps}{ex.isHold ? "s" : ""}</div>
                  <div style={{ fontSize: 10, color: prog.allHit ? colors.emerald : colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 2 }}>{prog.done}/{prog.total} sets</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 3, margin: "6px 0 10px" }}>
                {Array.from({ length: ex.targetSets }, (_, i) => {
                  const st = getSetStatus(ex.id, i, ex.targetReps);
                  return <div key={i} style={{ flex: 1, height: 3, borderRadius: 0, background: st === "hit" ? colors.emerald : st === "miss" ? colors.muted : colors.border, boxShadow: "none", transition: "all 0.3s ease" }} />;
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Array.from({ length: ex.targetSets }, (_, i) => {
                  const val = entries[ex.id]?.[i] ?? 0;
                  const ic = checked[ex.id]?.[i] || false;
                  const st = getSetStatus(ex.id, i, ex.targetReps);
                  const lv = LAST_SESSION[category]?.[level]?.[ex.id]?.[i];
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 0,
                      background: ic ? (st === "hit" ? "rgba(52,211,153,0.06)" : colors.mutedDim) : colors.surfaceLight,
                      border: "1px solid " + (ic ? (st === "hit" ? colors.emerald + "30" : colors.mutedBorder) : colors.border),
                      transition: "all 0.2s ease",
                    }}>
                      <SetCheckbox checked={ic} status={st} onClick={() => toggleCheck(ex.id, i)} />
                      <div style={{ width: 34, flexShrink: 0 }}><div style={{ fontSize: 9, fontWeight: 700, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>SET {i + 1}</div></div>
                      <div style={{ flex: 1 }}><input type="number" value={val || ""} onChange={e => updateSet(ex.id, i, e.target.value)} placeholder={"" + ex.targetReps} style={{ width: "100%", padding: "6px 8px", background: "rgba(6,8,15,0.5)", border: "1px solid " + colors.border, borderRadius: 0, color: colors.textPrimary, fontSize: 15, fontWeight: 700, fontFamily: "var(--font-display)", outline: "none", textAlign: "center" }} /></div>
                      <button onClick={() => onCamera(category, ex.id)} title="Auto count with camera" style={{
                        width: 28, height: 28, borderRadius: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: colors.primaryDim, border: "1px solid rgba(0,229,255,0.2)", cursor: "pointer", transition: "all 0.2s ease",
                      }}><Camera size={13} color={colors.primary} strokeWidth={2} /></button>
                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 44 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: cc.accent, fontFamily: "var(--font-mono)" }}>/ {ex.targetReps}{ex.isHold ? "s" : ""}</div>
                        {lv !== undefined && <div style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 1 }}>last: {lv}{ex.isHold ? "s" : ""}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progression guide toggle */}
              {(() => {
                const guide = PROGRESSION_GUIDE[ex.id];
                if (!guide) return null;
                const isOpen = expandedGuide === ex.id;
                return (
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => setExpandedGuide(isOpen ? null : ex.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "10px 0", width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 6,
                      color: colors.textSecondary, fontSize: 12, fontFamily: "var(--font-mono)",
                    }}>
                      <ChevronRight size={12} style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }} />
                      Progression guide
                    </button>

                    {isOpen && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {/* Tip */}
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 8px" }}>
                          <Lightbulb size={14} color={colors.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.5 }}>{guide.tip}</span>
                        </div>

                        {/* Video link */}
                        <a href={guide.video} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 8px", textDecoration: "none" }}>
                          <ExternalLink size={14} color={colors.primary} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: colors.primary, fontFamily: "var(--font-mono)" }}>Form guide</span>
                        </a>

                        {/* Regression */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 8px" }}>
                          <ArrowDownRight size={14} color={colors.muted} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>Scale down:</span>
                          <span style={{ fontSize: 13, color: colors.muted }}>{guide.regress}</span>
                        </div>

                        {/* Next progression */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 8px" }}>
                          <ArrowUpRight size={14} color={colors.emerald} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>Next:</span>
                          <span style={{ fontSize: 13, color: colors.emerald }}>{guide.next}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ width: "100%", padding: "10px 12px", background: colors.surfaceLight, border: "1px solid " + colors.border, borderRadius: 0, color: colors.textPrimary, fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit" }} />
      </div>

      <button onClick={handleSave} style={{ marginTop: 16, width: "100%", padding: "16px", borderRadius: 0, background: "linear-gradient(135deg, " + cc.accent + "20, " + cc.accent + "08)", border: "1px solid " + cc.border, color: cc.accent, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-display)", cursor: "pointer", letterSpacing: "0.08em", boxShadow: "none"}}>SAVE SESSION</button>
    </div>
  );
}

// ─── SKILL TREE ──────────────────────────────────────────────────────────────

function SkillTreeScreen() {
  const categories = ["push", "pull", "squat"];
  const [sel, setSel] = useState(null);

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 4 }}>SKILL TREE</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.textPrimary, fontFamily: "var(--font-display)", marginBottom: 20 }}>Your Progress</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {categories.map(cat => (
          <div key={cat} style={{ textAlign: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: catColors[cat].accent, fontFamily: "var(--font-mono)" }}>{cat.toUpperCase()}</span>
            <div style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 2 }}>L{MOCK_USER.levels[cat]}</div>
          </div>
        ))}
      </div>

      {[5, 4, 3, 2, 1].map((level, ri) => (
        <div key={level} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 4 }}>
          {categories.map(cat => {
            const gate = MOCK_GATES[cat].find(g => g.level === level);
            if (!gate) return <div key={cat} />;
            return (
              <div key={cat} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {ri > 0 && <div style={{ width: 2, height: 10, background: (gate.status === "passed" || gate.status === "in-progress") ? catColors[cat].accent + "30" : colors.border }} />}
                <NodeBadge gate={gate} categoryColor={catColors[cat].accent} onClick={() => setSel({ ...gate, category: cat })} />
                <div style={{ fontSize: 8, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: gate.consecutivePasses > 0 ? 6 : 2 }}>L{level}</div>
              </div>
            );
          })}
        </div>
      ))}

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, background: "rgba(6,8,15,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.surface, border: "1px solid " + catColors[sel.category].border, borderRadius: 0, maxWidth: 340, width: "100%", padding: "24px 20px", boxShadow: "none"}}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CategoryBadge category={sel.category} /><span style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)", color: colors.textPrimary }}>Level {sel.level}</span></div>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: sel.status === "passed" ? colors.emerald : catColors[sel.category].accent }}>{sel.status === "passed" ? "PASSED" : sel.consecutivePasses + "/3"}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>{[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: 4, borderRadius: 0, background: i < sel.consecutivePasses ? catColors[sel.category].accent : colors.border }} />)}</div>
            <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 10 }}>EXERCISES</div>
            {(EXERCISES[sel.category]?.[sel.level] || []).map((ex, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + colors.border }}>
                <span style={{ fontSize: 13, color: colors.textPrimary }}>{ex.name}</span>
                <span style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>{ex.targetSets}x{ex.targetReps}{ex.isHold ? "s" : ""}</span>
              </div>
            ))}
            <button onClick={() => setSel(null)} style={{ marginTop: 14, width: "100%", padding: "10px", background: "transparent", border: "1px solid " + colors.border, borderRadius: 0, color: colors.textSecondary, fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><X size={12} /> CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────

function HistoryScreen() {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 4 }}>HISTORY</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.textPrimary, fontFamily: "var(--font-display)", marginBottom: 20 }}>Past Sessions</div>
      {MOCK_HISTORY.map((week, wi) => (
        <div key={wi} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, fontFamily: "var(--font-display)" }}>{week.week}</div>
            <div style={{ display: "flex", gap: 5 }}>{["push", "pull", "squat"].map(cat => <div key={cat} style={{ width: 8, height: 8, borderRadius: 0, background: week.weekProgress[cat] ? catColors[cat].accent : colors.border }} />)}</div>
          </div>
          {week.sessions.map((s, si) => {
            const key = wi + "-" + si, isE = expanded === key;
            return (
              <div key={si} onClick={() => setExpanded(isE ? null : key)} style={{ background: colors.surface, border: "1px solid " + colors.border, borderRadius: 0, padding: "12px 14px", cursor: "pointer", marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)", minWidth: 28 }}>{s.date}</span>
                    <CategoryBadge category={s.category} />
                    <span style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>L{s.level}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: s.passed ? colors.emerald : colors.muted, display: "flex", alignItems: "center", gap: 3 }}>
                      {s.passed ? <Check size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />} {s.consecutiveAfter}/3
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--font-display)", color: s.passed ? colors.emerald : colors.amber }}>{s.percentage}%</span>
                    <ChevronRight size={12} color={colors.textSecondary} style={{ transform: isE ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }} />
                  </div>
                </div>
                {isE && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + colors.border }}>
                    {s.exercises.map((ex, ei) => (
                      <div key={ei} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {ex.hit ? <Check size={12} color={colors.emerald} strokeWidth={3} /> : <Minus size={12} color={colors.muted} strokeWidth={3} />}
                            <span style={{ fontSize: 12, color: colors.textPrimary }}>{ex.name}</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: ex.hit ? colors.emerald : colors.amber }}>{ex.pct}%</span>
                        </div>
                        <ProgressBar value={ex.pct} max={100} color={ex.hit ? colors.emerald : colors.amber} height={3} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── CAMERA WORKOUT SCREEN ───────────────────────────────────────────────────

function CameraWorkoutScreen({ category, exerciseId, onBack }) {
  const cc = catColors[category];
  const level = MOCK_USER.levels[category];
  const exercises = EXERCISES[category]?.[level] || [];
  const ex = exercises.find(e => e.id === exerciseId) || exercises[0];

  const [status, setStatus] = useState("idle"); // idle | countdown | active | paused | done
  const [repCount, setRepCount] = useState(0);
  const [holdTime, setHoldTime] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [currentSet, setCurrentSet] = useState(1);
  const [setResults, setSetResults] = useState([]);

  const isHold = ex?.isHold;
  const target = ex?.targetReps || 0;

  // Countdown timer
  useEffect(() => {
    if (status !== "countdown") return;
    if (countdown <= 0) { setStatus("active"); return; }
    const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

  // Simulate counting
  useEffect(() => {
    if (status !== "active" || !ex) return;
    const interval = setInterval(() => {
      if (isHold) {
        setHoldTime(prev => prev + 1);
      } else {
        setRepCount(prev => prev + 1);
      }
    }, isHold ? 1000 : 1500);
    return () => clearInterval(interval);
  }, [status, isHold, ex]);

  const currentValue = isHold ? holdTime : repCount;
  const hitTarget = currentValue >= target;

  const handleStart = () => { setCountdown(10); setStatus("countdown"); };
  const handlePause = () => setStatus("paused");
  const handleResume = () => setStatus("active");
  const handleStop = () => {
    setSetResults(prev => [...prev, currentValue]);
    setStatus("done");
  };
  const handleNextSet = () => {
    if (currentSet < ex.targetSets) {
      setCurrentSet(s => s + 1);
      setRepCount(0);
      setHoldTime(0);
      setStatus("idle");
    }
  };
  const handleReset = () => {
    setRepCount(0);
    setHoldTime(0);
    setStatus("idle");
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  };

  return (
    <div style={{ height: "100vh", background: "#000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top bar — overlaid */}
      <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: colors.textSecondary, fontSize: 12, fontFamily: "var(--font-mono)" }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CategoryBadge category={category} />
          <span style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>L{level}</span>
        </div>
      </div>

      {/* Full screen camera area — everything overlays on this */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Simulated camera feed */}
        <div style={{ position: "absolute", inset: 0, background: "#0a0a0a" }} />

        {/* ── TOP OVERLAY: Exercise name + set info ── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, fontFamily: "var(--font-display)" }}>{ex.name}</div>
              <div style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                Set {currentSet} of {ex.targetSets}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: cc.accent, fontFamily: "var(--font-display)" }}>{ex.targetSets}x{target}{isHold ? "s" : ""}</div>
            </div>
          </div>
        </div>

        {/* ── CENTER: Counter ── */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
          {status === "idle" && (
            <div style={{ textAlign: "center" }}>
              <Camera size={36} color={colors.textSecondary} strokeWidth={1} style={{ marginBottom: 10, opacity: 0.3 }} />
              <div style={{ fontSize: 13, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginBottom: 24 }}>Position your body in frame</div>
              <button onClick={handleStart} style={{
                padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: cc.dim, border: "1px solid " + cc.border, color: cc.accent,
                fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", cursor: "pointer",
              }}>
                <Play size={16} fill={cc.accent} /> START
              </button>
            </div>
          )}

          {status === "countdown" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 96, fontWeight: 700, fontFamily: "var(--font-display)", color: colors.textPrimary, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {countdown}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 8 }}>
                Get ready
              </div>
            </div>
          )}

          {(status === "active" || status === "paused") && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 72, fontWeight: 700, fontFamily: "var(--font-display)", color: hitTarget ? colors.emerald : colors.textPrimary, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {isHold ? formatTime(currentValue) : currentValue}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary, fontFamily: "var(--font-mono)", marginTop: 6 }}>
                {isHold ? "/ " + target + "s" : "/ " + target + " reps"}
              </div>
              {status === "paused" && (
                <div style={{ fontSize: 12, fontWeight: 600, color: colors.amber, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginTop: 12 }}>PAUSED</div>
              )}
            </div>
          )}

          {status === "done" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 72, fontWeight: 700, fontFamily: "var(--font-display)", color: hitTarget ? colors.emerald : colors.amber, lineHeight: 1 }}>
                {isHold ? formatTime(currentValue) : currentValue}
              </div>
              <div style={{ fontSize: 13, color: hitTarget ? colors.emerald : colors.amber, fontFamily: "var(--font-mono)", marginTop: 6 }}>
                {hitTarget ? "Target hit" : currentValue + " / " + target}
              </div>
            </div>
          )}
        </div>

        {/* ── BOTTOM OVERLAY: Controls ── */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, padding: "20px", background: "linear-gradient(transparent, rgba(0,0,0,0.85) 40%)" }}>
          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            {status === "countdown" && (
              <button onClick={() => { setStatus("idle"); setCountdown(10); }} style={{
                padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: colors.textSecondary,
                fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", cursor: "pointer",
              }}>
                <X size={14} /> CANCEL
              </button>
            )}

            {status === "active" && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handlePause} style={{
                  padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: colors.textPrimary,
                  fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", cursor: "pointer",
                }}>
                  <Pause size={14} /> PAUSE
                </button>
                <button onClick={handleStop} style={{
                  padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.25)", color: colors.textPrimary,
                  fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", cursor: "pointer",
                }}>
                  <Square size={14} fill={colors.textPrimary} /> STOP
                </button>
              </div>
            )}

            {status === "paused" && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleResume} style={{
                  padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: cc.dim, border: "1px solid " + cc.border, color: cc.accent,
                  fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", cursor: "pointer",
                }}>
                  <Play size={14} fill={cc.accent} /> RESUME
                </button>
                <button onClick={handleStop} style={{
                  padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.25)", color: colors.textPrimary,
                  fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", cursor: "pointer",
                }}>
                  <Square size={14} fill={colors.textPrimary} /> STOP
                </button>
              </div>
            )}

            {status === "done" && (
              <button onClick={onBack} style={{
                padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: colors.emeraldDim, border: "1px solid rgba(52,211,153,0.25)", color: colors.emerald,
                fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", cursor: "pointer",
              }}>
                <Check size={16} /> COMPLETE SET
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function ContrlApp() {
  const [route, setRoute] = useState("home");
  const [logCategory, setLogCategory] = useState(null);
  const [cameraExercise, setCameraExercise] = useState(null);
  const [activeTab, setActiveTab] = useState("home");

  const navigateLog = (cat) => { setLogCategory(cat); setRoute("log"); };
  const navigateCamera = (cat, exId) => { setLogCategory(cat); setCameraExercise(exId); setRoute("camera"); };
  const navigateHome = () => { setRoute("home"); setLogCategory(null); setCameraExercise(null); setActiveTab("home"); };
  const navigateBackToLog = () => { setRoute("log"); setCameraExercise(null); };
  const navigateTab = (tab) => { setActiveTab(tab); setRoute(tab); };

  const tabs = [
    { key: "home", label: "HOME", Icon: Home },
    { key: "tree", label: "TREE", Icon: GitBranch },
    { key: "history", label: "HIST", Icon: Clock },
  ];

  const showNav = route !== "log" && route !== "camera";

  return (
    <div style={{
      minHeight: "100vh", background: route === "camera" ? "#000" : colors.bg, color: colors.textPrimary,
      fontFamily: "var(--font-display)", maxWidth: 420, margin: "0 auto", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        :root{--font-display:'DM Sans',sans-serif;--font-mono:'DM Mono',monospace}
        *{box-sizing:border-box;margin:0;padding:0}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
        ::placeholder{color:#475569}textarea::placeholder{color:#475569}
      `}</style>

      {route !== "camera" && (
        <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid " + colors.border, marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)", color: colors.primary, letterSpacing: "0.08em" }}>contrl</span>
          <span style={{ fontSize: 10, color: colors.textSecondary, fontFamily: "var(--font-mono)" }}>v0.1</span>
        </div>
      )}

      {route === "home" && <HomeScreen onNavigateLog={navigateLog} />}
      {route === "log" && logCategory && <LogScreen category={logCategory} onBack={navigateHome} onCamera={navigateCamera} />}
      {route === "camera" && logCategory && <CameraWorkoutScreen category={logCategory} exerciseId={cameraExercise} onBack={navigateBackToLog} />}
      {route === "tree" && <SkillTreeScreen />}
      {route === "history" && <HistoryScreen />}

      {showNav && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 420, background: "rgba(6,8,15,0.95)", backdropFilter: "blur(12px)",
          borderTop: "1px solid " + colors.border, display: "flex", padding: "8px 0 12px", zIndex: 40,
        }}>
          {tabs.map(({ key, label, Icon }) => {
            const isA = activeTab === key;
            return (
              <button key={key} onClick={() => navigateTab(key)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "transparent", border: "none", cursor: "pointer", padding: "4px 0",
              }}>
                <Icon size={18} color={isA ? colors.primary : colors.textSecondary} strokeWidth={isA ? 2.5 : 1.5} style={{ transition: "all 0.2s ease", ...(isA && { filter: "drop-shadow(0 0 6px " + colors.primary + "60)" }) }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: isA ? colors.primary : colors.textSecondary, fontFamily: "var(--font-mono)" }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}