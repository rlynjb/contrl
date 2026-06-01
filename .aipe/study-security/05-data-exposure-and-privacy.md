# Data exposure and privacy
### Over-fetching · PII in logs · verbose errors — Industry standard

> Where could user data leak — not through SQL injection, but through the boring channels: an API that returns more than needed, an error message that includes user content, a log line that captures a sensitive field. contrl is light on PII today; the discipline is to write the patterns before the data grows.

## Zoom out, then zoom in

Data exposure is the slow leak. No single line of code is wrong; the cumulative effect is that data ends up where it shouldn't. The three classic channels: **API responses that over-fetch**, **logs that capture user content**, and **error messages that include data**. contrl exposes a small amount of data through each, bounded by "there's not much PII to leak today."

```
  Zoom out — where data could leak in contrl

  ┌─ Supabase REST responses ────────────────────────────────────┐
  │  select('*') on every table; no field filtering              │
  │  → returns every column the schema defines                    │
  │  → today: bounded — no PII in schema                         │
  │  → Phase 4: PII (email, username) makes this a real concern  │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Logs ───────────────────────────────────────────────────────┐
  │  console.warn on sync errors (Supabase error object)         │
  │  JSON.stringify(session.exercises) at one DB-write call       │
  │  → today: bounded — no PII fields exist                      │
  │  → Phase 4: errors with user notes can leak content          │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Error responses ────────────────────────────────────────────┐
  │  Supabase PostgrestError includes details/hint/message       │
  │  passed through unchanged to console.warn                    │
  │  → could leak schema info, row content                       │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. The leak surface today is small because the data model is small. The buildable target is to write the patterns now (column-filtered selects, log sanitization, error redaction) so they're in place when the model grows.

## Structure pass

Layers: UI / Hooks / Sync / Storage.

Axis to trace: **what does each layer expose beyond what the caller actually needs?**

```
  Tracing the exposure axis

  layer                       exposure                  bounded by
  ─────                       ────────                  ──────────
  Storage (Supabase)          select('*') returns       schema has
                              every column              no PII today
  Sync                        passes whole rows to      mapper hides
                              mapper                    nothing
  Persistence                 JSON-stringifies exer-    notes is the
                              cises on write log         only freeform
                                                          field
  Hooks                       hold full state in mem    no upload
  UI                          rendering only            no innerHTML
```

Seam: at the **Supabase response → mapper** seam, every column is fetched. The mapper then drops some fields (e.g., `user_id` isn't in the local `WorkoutSession` type). But the fetch already happened. A select with explicit columns would have stopped it earlier.

## How it works

#### Move 1 — the picture

You already know "over-fetching" from REST API design. `GET /sessions` returning 50 fields when the client uses 10 isn't a security bug, but it is a privacy posture: the server is choosing to send data the client doesn't need.

```
  Two select patterns, same data

  over-fetch                           fetch what you need
  ──────────                           ───────────────────
  select('*')                          select('id, date,
    → returns every column                      exercises_json,
    → if a sensitive column is               notes, updated_at')
      added later, it's auto-          → explicit; new columns
      exposed                               require explicit opt-in
```

The discipline isn't about saving bytes (Supabase is fast). It's about **explicit data flow**: when someone adds a `private_user_notes` column later, the existing `select('*')` calls silently start including it.

#### Move 2 — three exposure channels in contrl

**Channel 1. Over-fetching on Supabase pulls.**

```ts
src/services/sync/supabase-sync.ts (~lines 140-145, abstracted)

  const { data: profileRows } = await supabase
    .from('user_profile')
    .select('*')                               ← every column
    .gte('updated_at', since);

  const { data: exerciseRows } = await supabase
    .from('exercises')
    .select('*')
    .gte('updated_at', since);

  // same for: sessions, gate_progress, week_progress
```

What's safe today: the schema has no PII. `user_profile` has integer levels and timestamps. `exercises` has names, categories, target counts. `sessions` has dates, exercises_json, notes, timestamps. No emails, no addresses, no phone numbers.

What changes in Phase 4: if `user_profile` gains an email or display name, `select('*')` returns it automatically. If a new internal field is added (a soft-deleted flag, a "review_pending" marker, a debug field), it ships too. The fix is to explicitly list columns:

```ts
  const { data: profileRows } = await supabase
    .from('user_profile')
    .select('user_id, push_level, pull_level, squat_level, '
          + 'created_at, updated_at')
    .gte('updated_at', since);
```

This isn't a performance change — it's a *contract* change. The mapper now depends on a fixed shape; new fields don't sneak in.

**Channel 2. Logs capturing user content.**

```ts
src/services/database.ts (~line 382, abstracted)

  await db.runAsync(
    `INSERT INTO sessions (id, date, exercises_json, notes, ...)
     VALUES (?, ?, ?, ?, ...)`,
    [session.id, session.date,
     JSON.stringify(session.exercises),    ← bound, safe in SQL
     session.notes, ...]
  );

  // elsewhere, debug logging:
  console.log('session inserted', { id: session.id,
                                    exercises: session.exercises });
                                              ▲
                                              │
                                    user-controlled content
                                    in the log buffer
```

If a user types something sensitive in `session.notes` (medication, an injury detail, anything they didn't expect to be logged), the log line captures it. Today the logs go to the device's console; tomorrow they might go to a remote logging service (Sentry, etc.) and become permanent.

The fix is a **logging policy**: by default, log identifiers and counts, never raw user content. Add an explicit `debugSession(s)` helper when verbose logging is needed during development.

```ts
  // standard logger — no user content
  function logSessionEvent(label: string, s: WorkoutSession) {
    console.log(label, {
      id: s.id,
      date: s.date,
      exerciseCount: s.exercises.length,
      hasNotes: !!s.notes,                  ← presence, not content
    });
  }
```

**Channel 3. Supabase error objects in logs.**

```ts
src/services/sync/supabase-sync.ts (~line 17-25)

  function logErr(label: string, error: unknown) {
    console.warn(`[sync] ${label}`, error);
                                    ▲
                                    │
                          ┌─────────┴───────────────────────────┐
                          │ Supabase's PostgrestError:           │
                          │   { code, message, details, hint }   │
                          │ for some failures, `details` and    │
                          │ `hint` contain row content or       │
                          │ column values from the offending    │
                          │ query.                              │
                          └─────────────────────────────────────┘
  }
```

This pairs with file 04's log-scrubbing finding. The fix is one wrapper:

```ts
  function logErr(label: string, error: unknown) {
    console.warn(`[sync] ${label}`, redact(error));
  }

  function redact(error: unknown) {
    if (!error || typeof error !== 'object') return error;
    const e = error as { code?: string; message?: string };
    return {
      code: e.code,
      message: truncate(e.message ?? 'unknown', 200),
      // details/hint omitted by default
    };
  }
```

#### Move 2 variant — the load-bearing skeleton of "exposure discipline"

```
  Skeleton — three habits

  1. EXPLICIT SELECTS
       enumerate columns at the fetch boundary; new fields
       require explicit opt-in to be returned

  2. STRUCTURED LOGS WITHOUT USER CONTENT
       log identifiers, counts, durations, status codes —
       never the raw content of a free-text field

  3. REDACTED ERRORS
       error objects from external services often include
       data; wrap them in a redactor before they reach a
       log or a remote service
```

Each habit is small. The compound effect is large: data flows through clearly named channels, and new fields don't accidentally leak through old log lines.

#### Move 3 — the principle

> Data exposure is the slow leak. It's never one line of code that breaks privacy — it's the accumulation of "I'll just log this" and "select-star is fine" decisions. Write the patterns before the data grows. Make explicit what's returned, what's logged, and what reaches external services.

## Primary diagram

```
  contrl's exposure surface

  ┌─ Supabase REST → mapper ─────────────────────────────────────┐
  │  select('*')   → every column returned                       │
  │                                                              │
  │  today's data:  user_profile { user_id, *_level, timestamps} │
  │                 exercises    { id, name, category, targets } │
  │                 sessions     { id, date, exercises, notes,   │
  │                                user_id, timestamps }         │
  │                                                              │
  │  bounded by: no PII fields today                              │
  │  fix: explicit column list at each select                    │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Console logs ───────────────────────────────────────────────┐
  │  default: no raw user content                                │
  │  exception: today's logErr passes Supabase error through     │
  │              unchanged → can leak row data                   │
  │  fix: redact wrapper at the log boundary                     │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Future: remote logging ─────────────────────────────────────┐
  │  not present today; Sentry/Bugsnag would multiply the cost   │
  │  of every existing log call (device → cloud → retained)      │
  │  fix: before wiring remote logging, apply the redact +       │
  │       explicit-select habits first                            │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### Channel 1 — over-fetching

```ts
src/services/sync/supabase-sync.ts (the pull path)

  const tables = ['user_profile', 'exercises', 'sessions',
                  'gate_progress', 'week_progress'];

  // every table is pulled with select('*')
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')                           ← finding
      .gte('updated_at', since);
    ...
  }
```

The fix is per-table explicit columns. Cheap to write, paid back when columns proliferate:

```ts
  const PULL_COLUMNS = {
    user_profile:  'user_id, push_level, pull_level, squat_level, '
                 + 'created_at, updated_at',
    exercises:     'id, user_id, name, category, target_sets, '
                 + 'target_reps, target_hold_seconds, '
                 + 'created_at, updated_at',
    sessions:      'id, user_id, date, exercises_json, notes, '
                 + 'created_at, updated_at',
    // etc.
  };

  const { data, error } = await supabase
    .from(table)
    .select(PULL_COLUMNS[table])
    .gte('updated_at', since);
```

### Channel 2 — log discipline

The default pattern that should replace every `console.log(...userObject...)`:

```ts
  // src/lib/logging.ts (proposed)
  type EventSafeShape = Record<string, string | number | boolean | null>;

  export function logEvent(label: string, safe: EventSafeShape) {
    console.log(label, safe);
  }

  // usage
  logEvent('session.inserted', {
    id:           session.id,
    date:         session.date,
    exerciseCount: session.exercises.length,
    hasNotes:     !!session.notes,           ← presence flag, not content
  });
```

For development-time deep inspection, an explicit opt-in:

```ts
  // gate behind __DEV__ so production builds never include it
  if (__DEV__) {
    console.debug('session content', session);
  }
```

### Channel 3 — Supabase error redaction

```ts
  // src/lib/logging.ts (continued)
  export function logSyncError(label: string, error: unknown) {
    console.warn(`[sync] ${label}`, redactSupabaseError(error));
  }

  function redactSupabaseError(error: unknown) {
    if (!error || typeof error !== 'object') return { code: 'unknown' };
    const e = error as {
      code?: string;
      message?: string;
      details?: string;       // often contains row data
      hint?: string;          // often contains schema info
    };
    return {
      code:    e.code ?? 'unknown',
      message: truncate(e.message ?? '', 200),
      // details and hint intentionally dropped
    };
  }

  function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
```

Every site currently calling `logErr(label, e)` becomes `logSyncError(label, e)` — same call shape, redacted output.

## Elaborate

The cheapest privacy work is the work you don't redo later. contrl can add explicit selects, structured logs, and error redaction today at near-zero cost — there's almost no code to change. The same work after Phase 4 ships (when emails, usernames, and possibly health-adjacent notes are flowing) is substantially harder, both because more sites need updating and because the leak surface grew while the discipline was missing.

There's a regulatory framing worth knowing even if not directly relevant: **data minimization** is a principle in most modern privacy regimes (GDPR, CCPA). It means: don't collect what you don't need, don't expose what you didn't collect, and don't retain past the use case. The technical habits in this file — explicit selects, structured logs, error redaction — are the engineering shape of data minimization. They're worth writing even when the regulatory pressure is years away.

A practical pattern: when adding a new column to a Supabase table, the *next* commit should update every `select('*')` to explicitly enumerate columns including the new one. That makes "what does this query return?" answerable from the query itself, not from a separate schema document. The code becomes the documentation.

A note on `__DEV__`: React Native exposes this global at build time. Code inside `if (__DEV__) { ... }` blocks gets stripped from production bundles. That's the right gate for verbose logging — present during development, gone in production.

## Interview defense

**Q: "How do you think about data exposure in this app?"**

```
  ┌─ Three channels ───────────────────────────────────────────────┐
  │                                                                 │
  │  1. API responses: today selects('*') on five tables — bounded │
  │     by "no PII in the schema yet." Fix: explicit column lists  │
  │     at each select. Cheap now; expensive later.                │
  │                                                                 │
  │  2. Logs: structured logging discipline — identifiers, counts, │
  │     status flags; never raw user content. Verbose dev logs    │
  │     gated behind __DEV__.                                      │
  │                                                                 │
  │  3. Error redaction: Supabase error objects include details   │
  │     and hint fields that often contain row data. Wrap with a  │
  │     redactor before any log or remote service.                 │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "data exposure is the slow leak — write the patterns before the data grows."

**Q: "Why isn't `select('*')` fine? It's just SQL."**

It's fine until a column is added and someone forgets to update the existing logging or response shape. The discipline is to make new columns *opt-in to exposure*, not opt-out. Explicit selects also document the contract: a future reader sees what the mapper depends on without inferring it from the type.

**Q: "Logs are local on a phone. Why does it matter what's in them?"**

Three reasons. First, logs are routinely shared during support (screenshot of a stack trace). Second, the moment remote logging gets added (Sentry, Bugsnag), every existing log line becomes a remote record — and you don't get to retroactively redact what was already there. Third: dev habit matters. Devs who log raw user content in one place will do it in others.

## Validate

1. **Reconstruct.** List the three exposure channels and the fix for each.
2. **Explain.** What's "data minimization"? Give the engineering shape of it.
3. **Apply.** Phase 4 adds an `email` column to `user_profile`. List the files that need to change and what each change looks like.
4. **Defend.** Argue that explicit selects are over-engineering at this scale. Then rebut.

## See also

- [01-trust-boundaries-and-attack-surface.md](./01-trust-boundaries-and-attack-surface.md) — the Supabase boundary is where over-fetch matters most
- [04-secrets-and-configuration.md](./04-secrets-and-configuration.md) — log scrubbing as a secrets concern
- [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) — Phase 4's notes-to-prompt path is also an exposure path
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — the over-fetch + log findings ranked
