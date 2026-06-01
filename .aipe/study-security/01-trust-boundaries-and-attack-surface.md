# Trust boundaries and attack surface
### Trust boundary · attack surface — Industry standard

> The zoom-out for the guide. Map every place untrusted input crosses into trusted code. Once the surface is named, every other concept becomes "what's the trust assumption at this specific boundary?"

## Zoom out, then zoom in

A trust boundary is wherever something **not under your control** flows into something that is. Inputs from the user, responses from external services, file contents you didn't author, packages you imported — each is a boundary. The job of security design is to name them, and at each one, decide what you're willing to assume.

```
  Zoom out — contrl's trust boundaries today

  ┌─ UNTRUSTED ZONE ─────────────────────────────────────────────┐
  │                                                               │
  │   ┌─ user ──┐    ┌─ network ──┐    ┌─ camera ──┐             │
  │   │ taps,   │    │ Supabase   │    │ frames    │             │
  │   │ notes   │    │ REST resp  │    │ → poses   │             │
  │   └────┬────┘    └─────┬──────┘    └─────┬─────┘             │
  │        │ form           │ JSON           │ landmarks         │
  └────────┼────────────────┼────────────────┼──────────────────┘
           │ ★ boundary      │ ★ boundary     │ ★ boundary
  ┌────────▼────────────────▼────────────────▼──────────────────┐
  │  TRUSTED ZONE — your code                                     │
  │                                                               │
  │   app/, src/components/   →  src/hooks/                       │
  │     UI accepts input         hooks orchestrate                │
  │                                                               │
  │   src/services/database.ts  ←  SQLite (your bytes, your file) │
  │   src/services/sync/...     →  Supabase REST                  │
  │   src/lib/pose/...          ←  MediaPipe landmarks            │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘
```

Zoom in. contrl has **three live boundaries today** (form input, Supabase response, camera frames) and **two planned ones** (LLM agent input from notes, agent output to UI). Each gets a section below.

## Structure pass

Layers: UI / Hooks / Domain / Persistence / Sync / External (Supabase, MediaPipe model).

Axis to trace: **trust** — what can each side see or tamper with?

```
  Tracing the trust axis across each boundary

  boundary               source       destination       trust assumption
  ────────               ──────       ───────────       ────────────────
  Form ↔ hook            user         in-memory state   text is benign
                                                         (no injection sink)

  Supabase response →    cloud DB     SQLite mirror     remote rows have
   mapper                                                expected shape
                                                         (currently: ANY)

  Camera frame →         hardware    pose pipeline      landmarks numeric,
   landmarks                                             visibility in [0,1]

  Planned: notes →       user         LLM prompt        notes are NOT a
   agent (Phase 4)                                       command channel
                                                         (sanitize required)

  Planned: agent →       LLM API      UI                output matches
   structured output                                     declared schema
                                                         (Zod validate)
```

Seam: every boundary in this table is **a place where the axis FLIPS**. Outside the seam, anything goes. Inside, your invariants must hold. The seams are where defense lives.

## How it works

#### Move 1 — the boundary pattern, as a picture

You already use trust boundaries with `URLSearchParams.set()` vs naive string concat. `set()` escapes the value because the URL string is a trust boundary; concat trusts the input. The framework names the boundary; you choose to honor it.

```
  Crossing a trust boundary: two patterns

  pattern A — DEFENSIVE                pattern B — NAIVE
  ─────────────                        ─────────────────

  ┌─ untrusted input ─┐                ┌─ untrusted input ─┐
  │  user text        │                │  user text        │
  └────────┬──────────┘                └────────┬──────────┘
           │                                     │
  ┌────────▼──────────┐                          │
  │ parse + validate  │ ← validate at            │
  │ + reject early    │   the seam               │
  └────────┬──────────┘                          │
           │ typed, safe                          │
  ┌────────▼──────────┐                ┌────────▼──────────┐
  │ trusted use       │                │ trusted use       │
  │ (DB write, prompt,│                │ (assume safe)     │
  │ render, etc.)     │                └───────────────────┘
  └───────────────────┘                          ▲
                                                 │
                                          this is the bug
```

Defensive code validates at the boundary, then carries typed values across the trusted zone. Naive code defers the check and the typed value never exists.

#### Move 2 — each boundary in contrl, walked

**Boundary 1. Form input → in-memory state → SQLite.**

```
  User text path

  TextInput onChangeText               ← user-controlled string
       │
  useExerciseForm.updateValue          ← stored in state as-is
       │
  insertSession({ exercises, notes })  ← passed into runAsync()
       │
  expo-sqlite parameterized binding    ← ★ defense: parameterized
                                          (safe from SQL injection
                                          for VALUES, but see file 03
                                          for the column-name exception)
```

The defense is the parameterized binding. The codebase mostly uses it. There's one exception (column-name interpolation in `updateUserLevel`) — see [03-input-validation-and-injection.md](./03-input-validation-and-injection.md).

**Boundary 2. Supabase REST response → mapper → SQLite.**

```
  Cloud row path

  supabase.from('sessions').select('*')   ← remote row, any shape
       │
  sessionFromRemote(r: any)               ← ★ trust assumption:
       │                                    r has expected fields
       │
  { exercises: JSON.parse(r.exercises_json), ... }
       │                                    ★ throws on malformed
       │                                       (no validation)
       │
  insertSession(...)                       ← persisted
```

The trust assumption is unwritten today. The mapper uses `any` and the JSON parse has no guard. Until RLS is deployed (Phase 4), the anon key can read/write any row — a corrupted or malicious row in Supabase becomes a corrupted local state. See [03-input-validation-and-injection.md](./03-input-validation-and-injection.md) and [04-secrets-and-configuration.md](./04-secrets-and-configuration.md).

**Boundary 3. Camera frame → MediaPipe → landmarks.**

```
  Pose detection path

  vision-camera frame                    ← raw pixels from hardware
       │
  MediaPipe pose detector                ← model inference
       │                                    (GPU/CPU, on-device)
  { landmarks: [{ x, y, z, visibility }] }
       │                                  ← ★ trust assumption:
       │                                    numeric, well-formed
       │
  RepCounter.feed(angle)                  ← downstream math
```

This is the safest boundary in the system. Frames never leave the device. The model is a static bundled file (no remote model download). The landmarks are MediaPipe's output, not user-controlled. The "trust" here is on the model itself: see [06-dependencies-and-supply-chain.md](./06-dependencies-and-supply-chain.md).

**Boundary 4 (planned). Exercise notes → LLM agent prompt.**

```
  Planned coaching agent path (Phase 4 — NOT BUILT)

  session.notes (user text)              ← user-controlled
       │
  context assembly (planned)              ← agent prompt
       │
  <exercise_notes>NOTE TEXT</exercise_notes>   ← ★ planned defense:
       │                                       structural wrapping
       │                                       (Layer 1 anti-injection)
  Anthropic API
       │
  structured tool calls or final message
```

The planned defense is structural wrapping — exercise notes get wrapped in `<exercise_notes>` tags so the model treats them as data, not instructions. This is one of four planned defense layers ([07-llm-and-agent-security.md](./07-llm-and-agent-security.md)).

**Boundary 5 (planned). LLM output → UI render.**

```
  Planned agent output path

  model response                          ← may contain anything
       │
  Zod schema validation (planned)         ← ★ planned defense:
       │                                       reject malformed
       │                                       output
  { message, priority_cue, ... }
       │
  React component render                  ← typed, safe to render
```

The defense is the schema. The schema's strictness is the security. Today: not built.

#### Move 2 variant — the load-bearing skeleton of a defended boundary

```
  Skeleton — what a defended boundary needs

  1. THE BOUNDARY IS NAMED
       you can point at the line of code where untrusted →
       trusted (the parse, the await, the upsert)

  2. THE TRUST ASSUMPTION IS WRITTEN
       what must be true about the input for the trusted side
       to be safe (numeric, schema-valid, no SQL, length ≤ N)

  3. THE CHECK IS AT THE BOUNDARY
       not three layers in. validate, reject, or sanitize at
       the entry point. typed values flow inward.

  4. THE FAILURE MODE IS DEFINED
       what happens when the assumption fails? log + reject?
       fallback default? throw? answering this is the contract.
```

Drop #2 and the defense is folklore. Drop #3 and you'll repeat the check everywhere (or forget once). Drop #4 and a failed check produces whatever undefined behavior happens to fall out.

#### Move 3 — the principle

> Every input is hostile until proven otherwise; every boundary is your responsibility. The discipline is to enumerate boundaries, name the trust assumption at each, and validate at the seam — never inside the trusted zone.

The cost of skipping this discipline isn't immediate. A small repo with no auth and one developer can survive long without explicit boundary defense. The cost lands when the surface grows — Phase 4 adds an LLM (Boundary 4 + 5), multi-user adds auth (which then needs RLS, see file 02). Boundaries that weren't named when small become hidden when complex.

## Primary diagram

```
  contrl's attack surface — today and Phase 4

  ╔════════════════════════════════════════════════════════════════╗
  ║  TODAY (Phase 2A)                                              ║
  ╚════════════════════════════════════════════════════════════════╝

  ┌─ user ────────────┐  ┌─ Supabase ────────┐  ┌─ camera ──────┐
  │ form text         │  │ REST responses    │  │ frames        │
  │ (notes, names)    │  │ (any row, any DB) │  │ → MediaPipe   │
  └────────┬──────────┘  └────────┬──────────┘  └───────┬───────┘
           │ TS state              │ mapper(r: any)      │ landmarks
           │ + parameterized       │ + JSON.parse        │ (numeric)
           │ SQL                   │                     │
           ▼                       ▼                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  TRUSTED ZONE — your code (src/, app/)                       │
  │                                                              │
  │  defenses today:                                             │
  │    ✓ parameterized SQL (mostly)                              │
  │    ✗ no Zod schema on Supabase responses                     │
  │    ✗ no RLS yet (Supabase reads all rows on anon key)        │
  │    ✗ no auth yet (single hardcoded USER_ID)                  │
  │    ✗ SQL injection via category in updateUserLevel           │
  │       (gated by TS type only; runtime not validated)         │
  └──────────────────────────────────────────────────────────────┘

  ╔════════════════════════════════════════════════════════════════╗
  ║  PHASE 4 (PLANNED, not built)                                  ║
  ╚════════════════════════════════════════════════════════════════╝

  ┌─ user notes ─────────┐  ┌─ Anthropic API ─────┐
  │ exercise.notes       │  │ LLM responses       │
  │ (free text)          │  │ (any text)          │
  └────────┬─────────────┘  └────────┬────────────┘
           │ wrap in              │ Zod schema
           │ <exercise_notes>      │ validate
           ▼                       ▼
  ┌────────────────────────────────────────────────┐
  │  agent runner (planned src/lib/agent/)         │
  │    + iteration cap (K=8)                       │
  │    + token budget (50k)                         │
  │    + per-tool circuit breakers                 │
  │    + tool allowlist (5 read-only)               │
  │    + output Zod schema                          │
  └────────────────────────────────────────────────┘
```

## Implementation in codebase

### Boundary 1 — Form input → SQLite

```ts
src/hooks/useExerciseForm.ts (~line 120)
  function updateValue(exIdx, setIdx, value, isHold) {
    setExerciseState(prev => { ... });    ← user text into in-memory state
  }

src/services/database.ts (e.g., insertSession)
  await db.runAsync(
    `INSERT INTO sessions (id, date, exercises_json, notes, ...) VALUES (?, ?, ?, ?, ...)`,
    [session.id, session.date, JSON.stringify(session.exercises), session.notes, ...]
  );                                       ← parameterized binding
                                              defends against SQL
                                              injection in VALUES
```

What's safe: VALUES are parameterized everywhere CRUD writes happen.
What's not safe: column-name interpolation in one update path. See file 03.

### Boundary 2 — Supabase response → mapper

```ts
src/services/sync/supabase-sync.ts (~line 140, abstracted)
  const { data, error } = await supabase
    .from('sessions')
    .select('*');
  if (error) { ... }
  for (const r of data) {
    const session = sessionFromRemote(r);   ← r: any, no validation
    await insertSession(session);
  }

src/services/sync/mapper.ts
  export function sessionFromRemote(r: any): WorkoutSession {
    return {
      id: r.id,
      date: r.date,
      exercises: JSON.parse(r.exercises_json),   ← can throw,
                                                    no schema check
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
```

What's missing: a Zod schema between Supabase and the mapper. Without it, a corrupted row (malformed `exercises_json`, missing required field) propagates into SQLite. Today's risk is bounded by "only your own cloud writes the rows" — but the moment multi-tenant + missing RLS combine, this becomes the attacker's primary write surface.

### Boundary 3 — Camera frame → landmarks

```tsx
src/components/camera/PoseCamera.tsx (~line 44-61)
  // vision-camera frame processor
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const result = poseDetector.detectFor(frame);
    if (result.results.length > 0) {
      runOnJS(onLandmarks)(result.results[0].landmarks);
    }
  }, [poseDetector]);
```

Safe by construction: the model is static, the frames never upload, the landmarks are numeric tuples. The trust assumption ("landmarks are well-formed") could in theory be violated by a buggy MediaPipe build, but the failure mode is benign (downstream math returns NaN, rep-counter no-ops).

### Boundary 4 (planned) — Notes → LLM prompt

Not yet built. The planned defense lives in the agent spec:

```
.aipe/study-agent-architecture/agent-patterns-in-this-codebase.md (~line 98)
  Defense: input sanitization — exercise notes wrapped in
           <exercise_notes>...</exercise_notes>
  Lives in: src/lib/agent/sanitize.ts (planned)
```

The wrapping is one of four planned layers. See [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) for the full envelope.

### Boundary 5 (planned) — LLM output → UI

Not yet built. The planned defense:

```
  Zod schema: { message, priority_cue, confidence, formula_used }
  Lives in: src/lib/agent/schemas.ts (planned)
```

The UI never renders raw model output — only the validated structured shape.

## Elaborate

The single discipline that makes security tractable is **enumeration**. List every boundary; name every trust assumption. Once that's written down (in this file, in code comments, in design docs), the rest of the audit is mechanical: "boundary X has assumption Y; is Y actually being checked?"

contrl's boundary list is short today, which is why the audit can be honest about "too small to bite yet." Most security folklore comes from systems with dozens of boundaries (web apps with cookies, sessions, third-party iframes, file uploads, S3 buckets, microservice RPCs, JWTs, CORS). A local-first single-user app has a fraction of that surface. The discipline isn't to manufacture concerns; it's to name the real ones and plan for the ones that arrive with the next feature.

The biggest live concern in contrl is **Supabase without RLS**. Today, the anon key — which is in the client bundle by design — has full read/write access to all rows in all tables. The single hardcoded `USER_ID` is the only thing scoping reads to "the right user," and that scoping happens client-side. An attacker with the anon key (read from any APK or web bundle) can read all session data, write fake sessions, or delete rows. Today the data is one user's exercise log, so the attacker's payoff is essentially zero. Once auth ships and multiple users share the cloud, RLS becomes critical — and it has to ship in the same release as auth, not after.

## Interview defense

**Q: "Walk me through your app's attack surface."**

```
  60-second answer

  ┌─ three live boundaries today ──────────────────────────────────┐
  │  1. form input → SQLite (parameterized SQL defends)            │
  │  2. Supabase response → SQLite (no schema validation today;    │
  │     bounded by single-user + cloud you control)                │
  │  3. camera → MediaPipe (on-device only, model is bundled,      │
  │     frames never leave the phone)                              │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ two planned boundaries (Phase 4) ─────────────────────────────┐
  │  4. user notes → LLM prompt — wrap in <exercise_notes>          │
  │  5. LLM output → UI — Zod schema validates structure           │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ the load-bearing weakness ────────────────────────────────────┐
  │  no RLS on Supabase yet. anon key in client bundle is fine in  │
  │  principle, but only if RLS scopes reads to the authenticated  │
  │  user. today: single hardcoded user, so the cost is bounded.   │
  │  must ship RLS with auth.                                      │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "list the boundaries first; name the trust assumption at each; check the assumption at the seam."

**Q: "What happens if MediaPipe returns garbage?"**

The downstream math handles it — bad landmarks yield `NaN` angles; `RepCounter` doesn't transition. Worst case: a session records zero reps. No crash, no exploitable surface, because MediaPipe's output isn't input to a sink (SQL, prompt, render). It's input to math.

**Q: "Why isn't the anon key in the bundle a security bug?"**

Because Supabase anon keys are *designed* to be in the client bundle — they're the public credential. Security is enforced by RLS policies on the server, which validate the JWT user_id claim. Today contrl ships without auth, so the anon key has full table access, but the only data behind that anon key is one user's exercise log on a cloud the developer owns. The bug is "RLS not yet deployed," not "anon key in bundle."

## Validate

1. **Reconstruct.** Draw the five boundaries from memory; label each with its trust assumption and current defense.
2. **Explain.** Why is the camera boundary the safest? What would make it unsafe?
3. **Apply.** A new feature adds image upload (user takes a photo of their meal). What boundary is created, and where does the defense live?
4. **Defend.** Argue that the Supabase boundary doesn't need a Zod schema today. Then rebut.

## See also

- [02-authentication-and-authorization.md](./02-authentication-and-authorization.md) — the RLS gap that bounds Boundary 2
- [03-input-validation-and-injection.md](./03-input-validation-and-injection.md) — what defends each boundary in practice
- [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) — Phase 4 boundaries (4 and 5)
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — ranked findings across the surface
