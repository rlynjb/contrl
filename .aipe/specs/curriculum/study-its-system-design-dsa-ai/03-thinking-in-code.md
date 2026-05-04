# 03 — Thinking in code

This chapter is about how the codebase makes decisions explicit at the type and structure level. Many of these are also classic data-structures-and-algorithms territory — finite-state machines, online algorithms, hysteresis, exponential smoothing — wrapped in TypeScript that prevents the bugs that the algorithm itself would otherwise allow.

---

## 3.1 — Finite state machine: the rep counter 🟢

**What it is.** A finite state machine is a 5-tuple (states, alphabet, transitions, start, accept). It models any process where the next behaviour depends only on the current state plus the next input. Counting reps is a textbook FSM problem because a "rep" is a *trajectory*, not a single sample.

**Where it lives.** `src/lib/pose/rep-counter.ts:21`. States: `idle | ready | down | bottom | up`. Alphabet: a continuous angle. Transition function: the `switch (this.phase)` at line 36. Each branch reads `angle`, decides whether to advance, and returns whether a rep was completed.

```ts
case 'up':
  if (angle >= readyAngle - hysteresis) {
    this.count++
    this.phase = 'ready'
    repCompleted = true
  }
```

**Why it exists.** The naive "if angle dropped below X, count a rep" loses to noise — joint angles flicker. The FSM enforces that you must visit `bottom` before counting, which means a half-rep (down without bottom) doesn't count, and a flickering angle near the threshold can't double-count.

**General rule.** *Any time you find yourself with several boolean flags whose combinations matter (`isDown`, `wasUp`, `passedBottom`), you have a state machine in disguise — name the states.* Once states are named, transitions are easier to reason about than flag combinations.

**Go deeper.** Sipser's *Theory of Computation* ch. 1 for the formal definition; or read Erlang/OTP's `gen_statem` docs for the engineering shape. The cleanest article is Yang's "State Machines for Game Programming."

---

## 3.2 — Hysteresis (preventing edge bouncing) 🟡

**What it is.** Hysteresis is using *two* thresholds for what naively wants to be one: a higher threshold to enter a state and a lower one to leave. The gap between them prevents an input hovering at the edge from rapidly toggling.

**Where it lives.** `RepCounterConfig.hysteresis` at `rep-counter.ts:11`, applied throughout the FSM transitions. Example at line 38: enter `ready` when `angle >= readyAngle - hysteresis`. Leave `ready` (back to `down`) when `angle < readyAngle - hysteresis`. The 10° hysteresis (per `.aipe/project/context.md:58`) is tuned to swallow joint-tracking jitter without losing real reps.

**Why it exists.** MediaPipe pose landmarks are noisy. A user holding the top of a pushup at exactly `readyAngle` will fluctuate ±5° per frame. Without hysteresis, you'd count 10 reps from one held position.

**General rule.** *If a system flips on a threshold, give the threshold a width.* Thermostats, retry logic ("error rate is high" / "error rate is low again"), reconciliation loops — all want hysteresis.

---

## 3.3 — Exponential smoothing 🟡

**What it is.** A streaming low-pass filter: `smoothed = α·current + (1-α)·previous`. O(1) memory; gives you a rolling average without storing a window.

**Where it lives.** Applied to joint angles before they reach the rep counter (per `.aipe/project/context.md:58`, "exponential smoothing on joint angles"). The exact site is `src/lib/pose/angles.ts` (file present in the directory listing).

**Why it exists.** Same noise problem as 3.2, addressed at a different layer. Hysteresis fixes edge-bouncing at the *threshold*; smoothing fixes high-frequency wiggle in the *signal*. Both are needed because they handle different failure modes.

**General rule.** *Filter at the source; threshold at the consumer.* Pushing smoothing into the rep counter would tangle two responsibilities. Smoothing belongs to the angle pipeline (which knows the signal); thresholding belongs to the FSM (which knows the meaning).

---

## 3.4 — Discriminated unions for processor dispatch 🟡

**What it is.** A union type where each variant carries a literal tag, so the type system can narrow exhaustively in a switch/if. TypeScript's killer feature for modeling "one of several shapes."

**Where it lives.** `src/lib/pose/exercises/pull.ts:24`:

```ts
if (config.equipment === 'trx' && config.isHold) {
  return { type: 'plank' as const, processor: createTrxHoldProcessor(config) }
}
if (config.equipment === 'trx') {
  return { type: 'rep' as const, processor: createTrxRepProcessor(config) }
}
return { type: 'rep' as const, processor: createBarPullProcessor() }
```

The `type` literal lets the consumer write `if (result.type === 'plank') …` and have TypeScript narrow `processor` to the hold processor's interface.

**Why it exists.** A TRX dead hang is *muscularly* a pull but *behaviourally* a plank — counted by elapsed time, not reps. The dispatcher returns the right processor type so the camera screen can pick rep-counter vs. hold-timer UI. Without the discriminator, the consumer would either lose type information (`processor: any`) or have to runtime-check shape.

**General rule.** *When a function might return one of several shapes, tag each shape and let the type system enforce the consumer handles all of them.* Adding a new variant becomes a compile error at every consumer that hadn't accounted for it — exactly when you want the error.

---

## 3.5 — Schema-first storage 🟢

**What it is.** Define the storage schema first; everything downstream conforms to it. CRUD signatures, types, and migrations all read off the same structural definition.

**Where it lives.** `src/services/database.ts:25-100` — every table is declared in one `execAsync` block. Types in `src/types/index.ts` mirror columns 1:1, with the sync fields (`notionPageId`, `updatedAt`) added uniformly across entities.

**Why it exists.** When schema is the spec, drift is structural and easy to see. The `notion_page_id` column on every syncable table is what makes the upsert pattern uniform across `upsertSessionFromNotion`, `upsertExercise`, etc. — they all key off the same column name.

**General rule.** *Pick one schema definition and let it dominate.* If your DB schema, ORM types, API types, and validation schemas are independently authored, you'll spend forever keeping them in sync. Drive everything from one source — even if that source is plain SQL DDL.

---

## 3.6 — Error classification (transient vs. permanent) 🟡

**What it is.** Every error response gets a class: should we retry, give up and surface, or quietly skip? The classification determines control flow.

**Where it lives.** `src/services/notion/api.ts:36-54`:

- `429` → wait `Retry-After` and recurse (don't increment retry counter).
- `>=500` and `retries < 3` → linear backoff and recurse.
- Otherwise non-`ok` → throw. Caller decides whether to surface to UI.

And at the call sites: `pullExercises`, `pullSessions`, `pushSessions`, `processDeletions` each catch their own errors and *push them into `result.errors`* rather than aborting the whole sync.

**Why it exists.** "Sync failed" is too coarse. A transient 503 should retry silently. A `4xx` validation error should surface. A push error on session #4 shouldn't prevent pushing session #5. The classification is what makes partial-success a sensible outcome rather than an exception state.

**General rule.** *Errors are a vocabulary, not a single token.* Decide which errors are recoverable and where; bake the policy into the boundary that has the most context.

---

## 3.7 — Optimistic UI / draft autosave 🟡

**What it is.** Save the user's in-progress work continuously to local storage so a crash, a phone call, or a navigation never loses input. The user types; the system persists in the background; on return, the form rehydrates.

**Where it lives.** `DraftSession` type at `src/types/index.ts:123`. `drafts` table at `database.ts:85`. Per `.aipe/project/context.md`, debounced 500ms while logging; cleared on save.

**Why it exists.** The log-workout flow is the highest-stakes interaction in the app — a user mid-set who loses their input is a user who stops trusting the app. Drafts are insurance.

**General rule.** *Long-form input deserves continuous local persistence.* Debounce so you're not writing on every keystroke; clear on completion so you don't rehydrate stale state. The pattern works for forms, drawings, anything multi-minute.

---

## 3.8 — Mapper pattern (boundary translation) 🟡

**What it is.** Translate between the domain shape and the external shape at exactly one place. Domain code never sees Notion shapes; Notion code never sees domain shapes; the mapper is the only thing that knows both.

**Where it lives.** `src/services/notion/mapper.ts` exposes `sessionToNotionProperties`, `notionPageToSession`, `notionPageToExercise`. `sync.ts:13` imports them; nothing else does. Domain code at `src/lib/game/` has zero awareness of Notion's `properties` shape.

**Why it exists.** Notion's property model is verbose, awkward, and changes occasionally; the domain model is clean. Without a mapper layer, every sync function would have hand-rolled `page.properties.title.title[0].plain_text` digs.

**General rule.** *Translate at the boundary, not at the call site.* If domain code needs to know how a remote system shapes its JSON, your boundary has leaked. The mapper is the firewall.

---

## 3.9 — Deterministic ID generation + late binding 🔴

**What it is.** When a record is created locally before being synced, generate a local ID, use it everywhere internally, and bind a remote ID to it later. The local ID is the durable handle.

**Where it lives.** Per `.aipe/project/context.md:25` — "remote-sourced records use remote ID; locally created records get a generated ID and are bound to a remote ID after first push." Mechanism: the `notion_page_id` column starts NULL on local creation; `setSessionNotionPageId` (`sync.ts:241`) writes the remote ID after a successful push. The `localById` / `localByNotion` maps in `pullSessions` (lines 124-127) handle both binding states.

**Why it exists.** You can create a session offline. The user expects it to exist *right now*, not "after we sync." The two-phase ID lets you reference, edit, and even delete the session before any remote round-trip.

**General rule.** *Local-first systems need stable local IDs.* Treat the remote ID as metadata that arrives later, not as the primary key. This is the same pattern as client-generated UUIDs in event-sourcing systems — and is why those work offline.

---

## 3.10 — Pure derivations as functions, not methods 🟢

**What it is.** Computations over domain data are exported as plain functions taking inputs and returning outputs. No `this`, no class state, no I/O.

**Where it lives.** `src/lib/game/`:
- `reconstructFromSessions(sessions): { userLevels, gateProgress }` — `reconstruct.ts:13`.
- `createGateProgress(category, level, userLevel): GateProgress` — `gate-check.ts:23`.
- `week-progress.ts`, `streaks.ts`, `progression.ts` follow the same shape.

**Why it exists.** Pure functions are trivially testable, trivially memoisable, and trivially reasoned about. `reconstructFromSessions` could be moved to a worker, replayed, or unit-tested with synthetic sessions — none of which is true once a function takes a database handle.

**General rule.** *Default to functions; reach for classes only when you actually need state or polymorphism.* In TypeScript on a small app, that's almost never. The `RepCounter` class earns its `this` because it has accumulated state across calls; `reconstructFromSessions` does not.
