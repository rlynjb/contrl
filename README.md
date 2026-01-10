# CalisthenIQ

CalisthenIQ is an AI-powered calisthenics coach focused on helping beginners build strength safely through proper form, controlled progressions, and body awareness.

Instead of generic workouts, CalisthenIQ uses an agent-based approach to guide users step-by-step—adapting exercises, cues, and difficulty based on movement quality, feedback, and consistency. The goal is not intensity, but sustainable strength built on solid fundamentals.

## Table of Contents

- [Key Ideas](#key-ideas)
- [Plan](#plan)
  - [1) MVP outcome (what the app does in v1)](#1-mvp-outcome-what-the-app-does-in-v1)
  - [2) Business workflow → agent workflow](#2-business-workflow--agent-workflow)
  - [3) Multi-agent MVP (3–4 agents, clean boundaries)](#3-multi-agent-mvp-34-agents-clean-boundaries)
  - [4) Tools & data you need (minimal but real)](#4-tools--data-you-need-minimal-but-real)
  - [5) Exercise library (MVP list that fits your niche)](#5-exercise-library-mvp-list-that-fits-your-niche)
  - [6) Orchestration: the simplest "multi-agent" controller](#6-orchestration-the-simplest-multi-agent-controller)
  - [7) Output contracts (JSON schemas)](#7-output-contracts-json-schemas--the-secret-to-making-it-robust)
  - [8) Prompts (short, practical) for each agent](#8-prompts-short-practical-for-each-agent)
  - [9) A concrete MVP session (what it looks like)](#9-a-concrete-mvp-session-what-it-looks-like)
  - [10) MVP build route (tech choices that match your background)](#10-mvp-build-route-tech-choices-that-match-your-background)
  - [11) Optional upgrades after MVP (don't do first)](#11-optional-upgrades-after-mvp-dont-do-first)
- [Architecture](#architecture)
  - [Frontend (Next.js)](#frontend-nextjs)
  - [Netlify Serverless Functions (Backend)](#netlify-serverless-functions-backend)
  - [OpenAI Agents SDK (How it fits your multi-agent MVP)](#openai-agents-sdk-how-it-fits-your-multi-agent-mvp)
  - [Your 4 In-App Agents (implemented in Agents SDK)](#your-4-in-app-agents-implemented-in-agents-sdk)
  - [Tools (Function Calling) exposed to the Agents SDK](#tools-function-calling-exposed-to-the-agents-sdk)
  - [Minimal Orchestration Pattern (recommended)](#minimal-orchestration-pattern-recommended)
  - [Data options for MVP (pick one)](#data-options-for-mvp-pick-one)
  - [What this looks like in practice](#what-this-looks-like-in-practice)
- [Implementation](#implementation)

## Key Ideas

- Beginner-first, injury-aware design
- Form, control, and movement quality over reps
- Agentic AI architecture (coach, progression, recovery)
- Bodyweight-only, minimal equipment friendly

## Plan

This is a direct, buildable multi-agent MVP for a calisthenics coach app (beginner, bodyweight/household/TRX/mini-band, gamified). This covers: workflow → agents → tools → data → prompts → orchestration.

### 1) MVP outcome (what the app does in v1)

In one chat/session, the app can:

- Collect a quick intake (goal, time, equipment, knee/wrist constraints, experience).
- Generate a today plan (warm-up → main sets → finisher → cooldown) with regressions.
- Coach form with rules + cues (no vision yet; user self-reports).
- Log results (reps/RPE/pain score).
- Award XP + streak + "next session suggestion".

That's enough to feel "agentic" without being huge.

---

### 2) Business workflow → agent workflow

User flow (state machine)

Intake → Plan → Coach → Log → Reward → Next plan

At each step, the system asks only what it needs, then moves on.

---

### 3) Multi-agent MVP (3–4 agents, clean boundaries)

#### A) Intake & Safety Agent

Goal: collect constraints + safety flags, keep scope tight.

Outputs (structured):

- `user_profile`: level, goals, time, equipment, injuries/constraints
- `readiness`: energy, soreness, pain scores
- `red_flags`: any "stop / consult professional" triggers

Why separate? Keeps your plan agent from becoming a messy questionnaire.

#### B) Program Designer Agent

Goal: generate the workout plan based on profile + readiness.

Outputs (structured):

- `workout_plan`: warmup/main/finisher/cooldown
- `regression_options`: per move
- `progression_rule`: how to scale next time
- `time_estimate`

Constraint: must only use allowed equipment (bodyweight/household/TRX/band).

#### C) Technique Coach Agent

Goal: execute during workout: cues, tempo, rest, modifications.

Inputs: plan + user feedback ("knee pain 4/10 on split squats")

Outputs:

- real-time cues
- swaps/regressions
- stop conditions

Important: This agent is "in the moment", not a planner.

#### D) Gamification & Adherence Agent

Goal: reward loop + next action.

Outputs:

- XP awards
- streak updates
- badge triggers
- "next session suggestion" (not full plan yet)

---

### 4) Tools & data you need (minimal but real)

**Storage (DB)**

Tables:

- `users` (profile basics)
- `sessions` (date, plan_json, completion, xp)
- `set_logs` (exercise, sets, reps, RPE, pain)
- `streaks` (current, best)
- `achievements` (earned_at, type)

**"Tools" your agents can call**

- `save_profile(profile)`
- `create_session(plan)`
- `log_set(session_id, set_data)`
- `update_xp(user_id, xp_delta)`
- `fetch_last_sessions(user_id, n)`
- (optional) `exercise_library_lookup(tags)` — could be local JSON build-time

No web browsing needed for MVP.

---

### 5) Exercise library (MVP list that fits your niche)

Tag each with:

- `difficulty`: 1–5
- `joints`: knee-friendly, wrist-friendly
- `equipment`: bodyweight/TRX/band/household
- `pattern`: push/pull/squat/hinge/core

**Starter library (enough for v1):**

- **Push**: incline push-up, knee push-up, push-up, pike push-up, TRX chest press
- **Pull**: TRX row, towel row (door-safe only if you can guarantee safety—otherwise skip), band row
- **Legs knee-friendly**: glute bridge, step-up (low), wall sit, RDL hinge, hamstring slide (towel)
- **Core**: dead bug, hollow hold, plank, side plank
- **Mobility**: hip flexor stretch, ankle rocks, thoracic rotations

---

### 6) Orchestration: the simplest "multi-agent" controller

Use a supervisor (router) that:

- Maintains app state
- Calls the right agent
- Validates output schema
- Enforces constraints (time/equipment/safety)

**Routing logic**

- If no profile → Intake agent
- If profile exists and no plan today → Program agent
- If in-session → Technique agent
- If session complete → Gamification agent

---

### 7) Output contracts (JSON schemas) — the secret to making it robust

**Example: Program Designer output (shape)**

```json
{
  "time_minutes": 30,
  "theme": "Full body - beginner",
  "warmup": [{ "name": "Ankle rocks", "duration_sec": 45 }, ...],
  "main": [
    {
      "block": "A",
      "type": "circuit",
      "rounds": 3,
      "exercises": [
        { "name": "TRX row", "sets": 3, "reps": "8-12", "tempo": "21X1", "rest_sec": 60, "notes": "..." },
        { "name": "Incline push-up", "sets": 3, "reps": "6-10", "tempo": "3111", "rest_sec": 60, "notes": "..." }
      ]
    }
  ],
  "finisher": [{ "name": "Wall sit", "sets": 2, "duration_sec": 30 }],
  "cooldown": [{ "name": "Hip flexor stretch", "duration_sec": 45 }],
  "regressions": {
    "Incline push-up": ["higher incline", "eccentric-only reps"],
    "TRX row": ["more upright body angle"]
  },
  "progression_rule": "Add 1 rep per set until top range, then progress difficulty next session."
}
```

Your supervisor can reject/repair plans that violate equipment/time.

---

### 8) Prompts (short, practical) for each agent

#### Intake & Safety Agent (system-ish)

- Collect only essentials in <= 6 questions
- Always ask pain score (0–10) for knee/wrist if relevant
- Output strictly structured JSON profile + readiness

#### Program Designer Agent

- Must obey equipment constraints
- Must keep within time limit
- Must include regressions + stop conditions
- Must keep beginner-friendly volume

#### Technique Coach Agent

- One instruction at a time
- Always ask for RPE + pain after first set
- If pain increases by 2+ points → regress or swap

#### Gamification Agent

- XP based on completion + consistency
- "Win the day" even if partial completion (adherence > intensity)
- Suggest next session focus (push/pull/legs/core balance)

---

### 9) A concrete MVP session (what it looks like)

User: "I have 25 mins, beginner, knee discomfort sometimes, TRX + mini band."

1. **Intake Agent**: produces profile + readiness.
2. **Program Agent**: returns 25-min knee-friendly plan (hinge + TRX pull + incline push + core).
3. **Technique Agent**: walks them through Block A round 1, asks RPE/pain, adjusts angle/tempo.
4. **Log Tool**: saves sets.
5. **Gamification Agent**: awards XP, streak + next suggestion.

---

### 10) MVP build route (tech choices that match your background)

Since you're already comfortable with Next.js + serverless:

- **Next.js UI** (chat + workout view)
- **Netlify Serverless Functions** as Supervisor/Orchestrator (single endpoint)
- **OpenAI Agents SDK** (handles agent routing and structured outputs natively)
- **Postgres (Neon)** + pgvector optional later
- Start with **single LLM** but multiple agents (role prompts) + a router

This is "real agentic architecture" without over-engineering.

---

### 11) Optional upgrades after MVP (don't do first)

- Weekly programming agent (periodization lite)
- Vision form checks (camera) with separate "Vision Agent"
- Personalization via embeddings over past sessions
- "Exercise substitution" tool using library retrieval
- Badge economy + quests ("3-day TRX streak")

---

## Architecture

MVP build route with concrete architecture + what runs where

### Frontend (Next.js)

UI: chat + "Workout Card" view (warmup/main/cooldown)

Calls your backend via:

- `/.netlify/functions/coach` (main orchestrator)

Streams responses if you want a "coach talking while thinking" feel (Agents SDK supports streaming + tracing).

---

### Netlify Serverless Functions (Backend)

#### 1) `/.netlify/functions/coach` = Supervisor / Orchestrator

This is your single entry point.

**Receives**: user message + session state

**Loads**: profile + last sessions from DB

**Routes to the right in-app agent:**

- Intake & Safety
- Program Designer
- Technique Coach
- Gamification & Adherence

**Why here?** This is where your control flow lives (state machine), not inside the model.

Netlify Functions are designed for API endpoints like this.

#### 2) Optional: `/.netlify/functions/coach_background` = Background compute

Use this for:

- Summarizing today's logs
- Generating "next week plan"
- Computing badges / analytics
- Cleaning up long traces

Netlify Background Functions are explicitly for longer-running tasks via async invocation.

#### 3) Secrets management

Store `OPENAI_API_KEY` in Netlify environment variables (never client-side).

---

### OpenAI Agents SDK (How it fits your multi-agent MVP)

**The key Agents SDK features you'll use:**

- Define multiple agents with distinct roles
- Tool calling (your DB/logging functions)
- Handoffs between agents
- Streaming + full traces of what happened

OpenAI's docs position the Agents SDK specifically for agentic apps with tools, handoffs, and tracing.

---

### Your 4 In-App Agents (implemented in Agents SDK)

#### A) Intake & Safety Agent

- Asks minimal questions
- Emits structured `user_profile` + `readiness` + `red_flags`

#### B) Program Designer Agent

- Builds today's plan (time/equipment constraints)
- Must include regressions + progression rule

#### C) Technique Coach Agent

- Executes live: cues, modifications, pain-based swaps

#### D) Gamification Agent

- XP, streaks, badges
- Suggests next session focus

---

### Tools (Function Calling) exposed to the Agents SDK

You'll expose server-side "tools" like:

- `save_profile(profile)`
- `fetch_last_sessions(user_id, n)`
- `create_session(plan)`
- `log_set(session_id, data)`
- `award_xp(user_id, delta)`

This uses the standard tool/function calling approach: you define tools, the model chooses to call them.

---

### Minimal Orchestration Pattern (recommended)

**Supervisor (code) decides "which agent"**

Don't let the model pick the agent every time in MVP.

Use a simple state machine:

- If missing profile → Intake Agent
- If no plan today → Program Agent
- If session is active → Technique Agent
- If session completed → Gamification Agent

Then call `Runner.run(agent, input)` (Agents SDK) for that step and save outputs.

This is how you keep the system testable and deterministic.

---

### Data options for MVP (pick one)

#### Option A: Postgres (Neon)

Best if you already have it in your stack.

**Note:** CalisthenIQ will be built using Postgres (Neon) as the database solution. Alternative options are included for reference and comparison purposes.

#### Option B: Netlify Blobs (super fast MVP)

A lightweight KV-ish store for:

- profile json
- session json
- streak counters

Netlify Blobs exists exactly for simple blob / KV storage use cases.

---

### What this looks like in practice

User message → coach function → supervisor routes → Agents SDK agent runs → tools are called → response returned (optionally streamed) → logs stored.

**You now have:**

- Real multi-agent architecture
- Real tool calling
- Real persistence
- Real traces/debuggability

---

## Implementation

1. Build coach function with state machine routing
2. Implement Intake Agent + `save_profile` tool
3. Implement Program Agent + `create_session` tool
4. Implement Technique Agent + `log_set` tool
5. Implement Gamification Agent + `award_xp` tool
