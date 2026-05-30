# Interview defense — contrl

This book is for one purpose: you, sitting across from a senior interviewer who has just said "tell me about a project you built," and you walking out of the room knowing you held ground. The project is **contrl** — a local-first, on-device-CV bodyweight-progression app. The book is 8 chapters. You read it front-to-back the first time. You skim the visual treatments on re-reading. The night before, you read only the one-page summary at the end of each chapter.

You did not build contrl in isolation. You used AI heavily — that's the 2026 reality, the interviewer knows it, and the book treats that explicitly. The senior signal isn't that you avoided AI; it's that you understand what you shipped well enough to own it. Chapter 8 is the dedicated meta-question. Every other chapter teaches the same posture at the per-decision level.

```
┌─ contrl — system at a glance ────────────────────────────────────────────────────────────┐
│                                                                                          │
│   UI layer — React Native (Expo SDK 55), expo-router file-based routing                  │
│        │                                                                                 │
│        │ reads + writes through hooks                                                    │
│        ▼                                                                                 │
│   Domain layer — useGameState · gate-check · progression · reconstruct · week-progress   │
│        │                                                                                 │
│        │ all logic is pure functions on session data; gates/levels/weeks are derived     │
│        ▼                                                                                 │
│   Storage layer — SQLite (expo-sqlite, WAL mode) — 9 tables — SOURCE OF TRUTH            │
│        │                                                                                 │
│        ▼                                                                                 │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                  Network boundary (HTTPS, optional)                                      │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│        │                                                                                 │
│        ▼                                                                                 │
│   Cloud mirror — Supabase Postgres (reindb project, contrl schema)                       │
│        write-mostly mirror; pull only on fresh install                                   │
│                                                                                          │
│                                                                                          │
│   Capture pipeline (parallel, on-device, no network) — Camera → MediaPipe → JS FSM       │
│                                                                                          │
│   ┌──────────────┐    ┌────────────────────┐    ┌──────────────────────┐                 │
│   │ Vision-camera│ ─► │ pose_landmarker_   │ ─► │ src/lib/pose/        │ ─► rep count    │
│   │  ~30 fps     │    │ lite.task on GPU    │    │   rep-counter.ts FSM │                 │
│   └──────────────┘    │ 33 landmarks/frame  │    │ exponential smoothing│                 │
│                       └────────────────────┘    └──────────────────────┘                 │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Every chapter returns to a slice of this map. When you get lost, come back here and re-anchor.

---

## How to use this book

```
┌─ Three reading passes ─────────────────────────────────────────────────────────┐
│                                                                                │
│   FIRST PASS — read front to back, one chapter per sitting.                    │
│      Goal: build the whole defense surface in your head, in order.             │
│                                                                                │
│   REVIEW PASS — skim only the visual treatments per chapter:                   │
│      opening diagram, "what they're really asking" callouts,                   │
│      strong-vs-weak side-by-sides, "I don't know" boxes,                       │
│      decision trees, pull quotes.                                              │
│      Goal: re-trigger the defenses without re-reading the prose.               │
│                                                                                │
│   NIGHT-BEFORE PASS — read only the one-page summary at the end of             │
│      each chapter. 8 pages total, ~20 minutes.                                 │
│      Goal: surface the answers without overloading.                            │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

The book is a *book*, not a reference grid. Each chapter is one continuous narrative that flows from a chapter-opening diagram through the questions an interviewer would actually ask. The visual treatments (callouts, boxes, trees, side-by-sides) are the recurring motifs — a reader who skims only those gets about 70% of the content.

---

## The 8 chapters

### 01 — The pitch
The first 60 seconds of every interview. Your project in three lengths: 10 seconds (elevator), 30 seconds (hallway), 90 seconds (the real answer to "tell me about a project you built"). The discipline of compression.

Questions: "Tell me about contrl." "What's it for?" "Who uses it?"

### 02 — The architecture
The whiteboard moment. You walk through contrl in 90 seconds, end-to-end, drawing as you go. Where the interviewer will interrupt and what to say when they do.

Questions: "Walk me through the system." "Show me the request flow." "Where's the data live?"

### 03 — The choices
One section per load-bearing decision. Expo + React Native, SQLite-as-source-of-truth, Supabase as a mirror, MediaPipe via vision-camera, on-device inference, the hardcoded USER_ID. Alternatives named, criteria honest, cost owned.

Questions: "Why React Native and not native?" "Why SQLite as the source of truth?" "Why Supabase and not your own backend?" "Why MediaPipe and not native ML Kit / Vision?" "Why is there no auth?"

### 04 — The scale story
What breaks first as load grows. 10× users, 100× data, 10× latency-sensitive requests. The first bottleneck, the second, what you'd add when, how you'd measure to know.

Questions: "What if you had 10,000 users?" "What if a user logged for 10 years?" "What if you needed real-time multi-user?"

### 05 — The failure story
Network failures, pose-detection failures, sync races, malformed input, partial writes, the restore-race bug. Failure surfaces named, system response named.

Questions: "What happens with no internet?" "What if MediaPipe glitches?" "Two devices, same user — what wins?"

### 06 — The hard parts
The reflective chapter. The hardest bug you fixed (the pull-restore race). The part you're proudest of (the idempotent reconstruction). The part you're least confident defending (gate the ML/LLM future-work cleanly).

Questions: "What was the hardest bug?" "What are you proudest of?" "What's the part you'd least like me to drill into?"

### 07 — The counterfactuals
What you'd do differently. Three or four reconsiderable decisions named, plus the anti-pattern: don't fabricate regret over choices that were obviously right.

Questions: "If you were starting today, what would you change?" "What would you keep?"

### 08 — The AI question
The 2026 meta-question. "Did you use AI?" "Can you explain this section line by line?" "What did the AI get wrong?" Three modes of decision-making: deliberate, evaluated-and-accepted, defaulted-to. Owning all three honestly.

Questions: "How much of this did you write?" "Walk me through this function." "What did Claude get wrong?"

---

## How this book pairs with the rest of the study system

This book is the **project-level wide opener**. It defends contrl as a whole — architecture, choices, scale, failure, counterfactuals. It does NOT replace the per-concept defenses that live inside the other study guides.

```
┌─ Project-level defense ─┐    ┌─ Concept-level defense ────────────────────┐
│                          │    │                                            │
│ THIS BOOK                │    │ .aipe/study-system-design-dsa/             │
│ "tell me about contrl"   │    │   per-concept Interview defense blocks     │
│   architecture           │    │   for each pattern (local-first, derived   │
│   choices                │    │   state, reconstruction, pose pipeline,    │
│   scale                  │    │   debounced autosave, supabase mirror,     │
│   failures               │    │   FSM rep counter, smoothing, etc.)        │
│   counterfactuals        │    │                                            │
│   AI question            │    │ .aipe/study-ai-engineering/                │
│                          │    │   per-concept Interview defense blocks     │
│ WIDE                     │    │   for ML/AI patterns (on-device inference, │
│                          │    │   audit-trail logging, recommender, etc.)  │
│                          │    │                                            │
│                          │    │ DEEP                                       │
└──────────────────────────┘    └────────────────────────────────────────────┘
```

You use both. This book gets you ready for the wide opener ("walk me through your project"). The concept files prepare you for the deep dive ("show me where you implemented X"). The two complement each other; neither substitutes.

---

## A note on coach voice

The book is addressed to **you**. Direct address throughout. When the book shows what to *say*, the prose is first-person present-tense — directly speakable. You should be able to read those passages aloud and have them sound natural.

When the book says "don't say this," it means it. The weak answers shown alongside strong ones are not strawmen — they are the patterns most candidates default to, the ones that make experienced interviewers tune out. Recognizing the failure pattern in your own voice is the first step to fixing it.

You have time. Read the book in order. The pitch chapter is short by design — start there.
