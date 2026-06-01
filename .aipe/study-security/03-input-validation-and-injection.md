# Input validation and injection
### SQL injection · prompt injection · schema validation — Industry standard

> Wherever input reaches a sink (SQL query, shell, file path, DOM, LLM prompt), the question is the same: was the input sanitized at the boundary, or is the sink trusting whatever showed up? contrl mostly does the right thing — with two specific exceptions worth fixing.

## Zoom out, then zoom in

Injection happens when input data is interpreted as code. The classic is SQL: `"SELECT * FROM users WHERE name = '" + name + "'"` lets `name` close the quote and run anything. The cure is universal: **never build the query string; bind the value as a parameter**. The database knows the value is data, not a query fragment.

```
  Zoom out — injection sinks in contrl

  ┌─ source: user / cloud ──────────────────┐
  │  form text, session.notes, exercise     │
  │  names, JSON from Supabase              │
  └──────────────┬──────────────────────────┘
                 │
                 ▼  must be sanitized BEFORE
  ┌─ sinks (where injection bites) ──────────┐
  │  SQL queries    (expo-sqlite)            │ ★ THIS CONCEPT ★
  │  JSON parse     (exercises_json column)   │
  │  LLM prompts    (planned, Phase 4)       │
  │  file paths     (no surface today)       │
  │  shell          (no surface)              │
  │  DOM (XSS)      (RN — no innerHTML)       │
  │  SSRF           (no URL construction      │
  │                  from user input)         │
  └──────────────────────────────────────────┘
```

Zoom in. Two specific findings in contrl today:

- **SQL: column-name interpolation in `updateUserLevel()`.** VALUES are parameterized everywhere, but one update path interpolates the *column name* from a string. Mitigated by TypeScript's `Category` union, but the runtime check isn't there.
- **JSON: no schema validation on Supabase responses.** `mapper.ts` uses `r: any` and calls `JSON.parse(r.exercises_json)` without guarding the shape. Bounded by "you control the cloud," but the path is open.

Prompt injection is a planned (not yet built) concern — see [07-llm-and-agent-security.md](./07-llm-and-agent-security.md).

## Structure pass

Layers: UI → Hooks → Persistence (SQL) and Sync (REST + JSON) → Storage.

Axis to trace: **does the input get sanitized at the boundary, or does the sink trust it?**

```
  Tracing the validation axis across each sink

  sink                                  defense today           verdict
  ────                                  ─────────────           ───────
  expo-sqlite runAsync(VALUES)          parameterized binding   safe
  expo-sqlite runAsync(column names)    string interpolation    UNSAFE
                                        in updateUserLevel        (one site)
  JSON.parse(row.exercises_json)        no try/catch, no Zod    UNSAFE
                                                                  (limited
                                                                  blast)
  React Native render (TextInput)       no innerHTML in RN      safe
  URL construction                      no user input in URLs   safe
  Planned: LLM prompt                   wrapping <exercise_notes> planned;
                                        not built                not yet
```

Seam: every sink in this table is a place where the input crosses from data into interpretation. The check has to happen at the seam, not three layers downstream.

## How it works

#### Move 1 — the picture

You already use this with `URLSearchParams.set('q', value)` vs string concat. The framework's API forces you across the seam safely; the manual concat lets you skip the seam.

```
  Two ways to pass user input to a sink

  parameterized                         interpolated
  ─────────────                         ────────────

  ┌─ user input ─┐                      ┌─ user input ─┐
  │  "Rein"      │                      │  "Rein'; DROP│
  └──────┬───────┘                      │   TABLE..."  │
         │                              └──────┬───────┘
         │ passed as parameter                 │ concatenated
         ▼                                     ▼
  ┌─ sink ────────────────┐             ┌─ sink ───────────────┐
  │ "...WHERE name = ?"   │             │ "...WHERE name='Rein';│
  │ + ["Rein"]            │             │   DROP TABLE...'"     │
  │ (driver escapes value)│             │ (driver runs it ALL)  │
  └───────────────────────┘             └───────────────────────┘
```

The sink-side defense is universal: keep the value distinct from the query. Anywhere the value gets baked INTO the query string, you've defeated the defense.

#### Move 2 — three patterns in contrl

**Pattern 1. Parameterized SQL — the good default (mostly used).**

```ts
src/services/database.ts (e.g., insertSession, ~line 375)

  await db.runAsync(
    `INSERT INTO sessions (id, date, exercises_json, notes,
                           user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.date, JSON.stringify(session.exercises),
     session.notes, USER_ID, session.createdAt, session.updatedAt]
  );
       │
       └─ ★ values are parameters; expo-sqlite binds them safely.
          no injection possible into VALUES, regardless of what
          session.notes contains
```

This is the pattern across nearly all of `database.ts`. The user can type whatever they want into `notes`; the binding makes it data, not query.

**Pattern 2. Column-name interpolation — the one exception.**

```ts
src/services/database.ts (~line 265, abstracted)

  export async function updateUserLevel(category: Category, level: number) {
    await db.runAsync(
      `UPDATE user_profile
       SET ${category}_level = ?, updated_at = ?
       WHERE user_id = ?`,
       │
       └─ ★ column name interpolated from `category`
              VALUES (?, ?, ?) are parameterized — those are fine
              The injection vector is the column-name part
      [level, new Date().toISOString(), USER_ID]
    );
  }
```

The vulnerability surface:

```ts
src/types/index.ts (~line 7)
  export type Category = 'push' | 'pull' | 'squat';
```

TypeScript constrains `category` to three values at *compile time*. At runtime, TypeScript has no enforcement — if `category` ever flows from untrusted input, becomes `string` in transit, gets cast unsafely, or is reached via a JSON deserialization without validation, an attacker-controlled string could land in the column-name slot.

Today's risk: low. `category` is currently passed only from internal code paths where the typed value is verifiable. The hardening cost is also low:

```ts
  // src/services/database.ts (proposed)
  const ALLOWED_CATEGORY_LEVEL_COLUMNS = {
    push:  'push_level',
    pull:  'pull_level',
    squat: 'squat_level',
  } as const;

  export async function updateUserLevel(category: Category, level: number) {
    const column = ALLOWED_CATEGORY_LEVEL_COLUMNS[category];
    if (!column) throw new Error(`invalid category: ${category}`);

    await db.runAsync(
      `UPDATE user_profile
       SET ${column} = ?, updated_at = ?
       WHERE user_id = ?`,
      [level, new Date().toISOString(), USER_ID]
    );
  }
```

Now the column name is *whitelisted* at runtime against a fixed map. Even if `category` arrives as an unvalidated string, the lookup either returns a known-safe column name or fails. TypeScript still helps; runtime now backs it up.

**Pattern 3. JSON.parse without schema validation — the wide-open sink.**

```ts
src/services/sync/mapper.ts (every fromRemote function)

  export function sessionFromRemote(r: any): WorkoutSession {
    return {
      id: r.id,
      date: r.date,
      exercises: JSON.parse(r.exercises_json),    ← ★ no shape check
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
```

Two issues stacked:

1. **`r: any`** — the parameter is unchecked. Missing fields produce `undefined`, malformed types coerce silently.
2. **`JSON.parse(r.exercises_json)`** — can throw on malformed JSON (uncaught crash); even if it parses, the result is `any` and assumed to be `ExerciseEntry[]`.

The defense is Zod (or any schema validator). The shape the validator enforces:

```ts
  // src/services/sync/schemas.ts (proposed)
  import { z } from 'zod';

  const ExerciseEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    actualSets: z.number().int().nonnegative(),
    actualReps: z.number().int().nonnegative().optional(),
    actualHoldSeconds: z.number().nonnegative().optional(),
    // ...
  });

  export const SessionRowSchema = z.object({
    id: z.string().uuid(),
    date: z.string(),
    exercises_json: z.string(),
    notes: z.string().nullable(),
    user_id: z.string().uuid(),
    created_at: z.string(),
    updated_at: z.string(),
  });

  // mapper becomes:
  export function sessionFromRemote(raw: unknown): WorkoutSession | null {
    const row = SessionRowSchema.safeParse(raw);
    if (!row.success) { logRejected(raw, row.error); return null; }

    let exercises: ExerciseEntry[];
    try {
      const parsed = JSON.parse(row.data.exercises_json);
      const result = z.array(ExerciseEntrySchema).safeParse(parsed);
      if (!result.success) { logRejected(parsed, result.error); return null; }
      exercises = result.data;
    } catch { return null; }

    return { id: row.data.id, date: row.data.date, exercises, ... };
  }
```

The mapper now answers "is this a valid session row?" at the boundary. Downstream code receives a typed `WorkoutSession`. Malformed rows get logged and dropped rather than corrupting local state.

#### Move 2 variant — the load-bearing skeleton of "validate at the boundary"

```
  Skeleton — three parts

  1. THE TYPE BOUNDARY
       where untrusted input becomes a value used by trusted
       code (a parse, a deserialize, an upsert)

  2. THE VALIDATOR
       the function or schema that asserts the value's shape
       (Zod, a typed parameterized query, a whitelist lookup)

  3. THE REJECTION PATH
       what happens when validation fails — throw? null? log
       and skip? must be defined; "silent acceptance" is the
       bug
```

Drop the validator and the value flows into a sink at its raw shape (the JSON.parse case). Drop the rejection path and a failed validation has no consistent outcome (the early-return-without-handler case). Both are present in contrl today.

#### Move 3 — the principle

> Validate at the boundary; carry typed values inward. Every sink that interprets input — SQL, JSON, prompt, render, file system — must receive data that has already been proven to fit the shape it expects.

The pattern in contrl is mostly compliant. The two exceptions (column-name interpolation, no Supabase Zod) are both *runtime-typing-gap* issues — TypeScript believes the code is safe at compile time, but runtime has no enforcement when the types come from outside the type system. The cure for both is the same: a runtime validator that mirrors the compile-time type.

## Primary diagram

```
  contrl's input → sink map

  ┌─ user form ──────┐  ┌─ Supabase row ──┐  ┌─ planned: notes ──┐
  │  TextInput       │  │  REST response  │  │  to LLM prompt    │
  └────────┬─────────┘  └────────┬────────┘  └─────────┬─────────┘
           │                     │                     │
           │ in-memory           │ mapper(r: any)      │ (Phase 4)
           │ state                │                     │
           ▼                     ▼                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  SINKS                                                       │
  │                                                              │
  │  expo-sqlite VALUES (?)                                      │
  │  ✓ parameterized — safe                                      │
  │                                                              │
  │  expo-sqlite ${column} interpolation in updateUserLevel      │
  │  ✗ runtime check missing — fix with whitelist map            │
  │                                                              │
  │  JSON.parse(r.exercises_json)                                │
  │  ✗ no schema; no try/catch — fix with Zod safeParse           │
  │                                                              │
  │  Planned: LLM prompt                                         │
  │  ⊘ wrap notes in <exercise_notes>; see file 07               │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### The two live findings

```ts
src/services/database.ts (~line 265) — FINDING #1

  export async function updateUserLevel(category: Category, level: number) {
    await db.runAsync(
      `UPDATE user_profile
       SET ${category}_level = ?, updated_at = ?
       WHERE user_id = ?`,
      [level, new Date().toISOString(), USER_ID]
    );
  }
       │
       └─ ★ proposed fix: ALLOWED_CATEGORY_LEVEL_COLUMNS lookup;
          throw on miss; column name comes from the map, never
          directly from the parameter

src/services/sync/mapper.ts (every fromRemote, ~150 LOC total) — FINDING #2

  export function sessionFromRemote(r: any): WorkoutSession { ... }
  export function exerciseFromRemote(r: any): Exercise { ... }
  export function userProfileFromRemote(r: any): User { ... }
  export function gateProgressFromRemote(r: any): GateProgress { ... }
  export function weekProgressFromRemote(r: any): WeekProgress { ... }
       │
       └─ ★ proposed fix: Zod schemas per row type;
          unknown → safeParse → drop or log on failure
```

### What's defended already

```ts
src/services/database.ts (all CRUD writes except the one above)

  await db.runAsync(`INSERT INTO sessions ... VALUES (?, ?, ?, ?, ...)`, [...]);
  await db.runAsync(`UPDATE sessions SET notes = ? WHERE id = ?`, [...]);
  await db.runAsync(`DELETE FROM sessions WHERE id = ?`, [...]);
       │
       └─ values are bound; arbitrary text in `notes` is data,
          not query. attacker cannot inject SQL through user input
          at these sites.
```

### What's not in scope (no surface today)

- **XSS** — React Native has no `dangerouslySetInnerHTML` equivalent on the components contrl uses. User text goes through `<Text>` which always renders as text.
- **SSRF** — no URL construction from user input. Supabase URL is hardcoded.
- **Command injection / shell** — no `child_process`, no shell execution.
- **Path traversal** — no user-controlled file paths.

These are absences, not defenses — but enumerating them keeps the audit honest. If contrl adds a feature that introduces any of these sinks (file upload, dynamic URL, etc.), the audit gets updated.

## Elaborate

The historical lesson from web security is that injection bugs are persistent because the boundary check is **easy to forget once**. A codebase with 200 SQL queries has 200 chances to skip the parameterization. The defense isn't "be careful"; it's tooling and pattern: ORMs, prepared statements, parameterized binding as the only ergonomic API.

contrl's persistence layer mostly does this right because `expo-sqlite`'s `runAsync(sql, params)` is the easy path. The one column-name interpolation slipped past because TypeScript's compile-time check *felt* like a runtime check. This is a recurring pattern across TypeScript codebases — devs see a union type and forget there's no runtime validation on inputs that flow through the type system from outside (JSON, URL params, env vars).

The Zod story for Supabase responses is slightly different: it's defense-in-depth, not a strict injection vulnerability. The threat model "Supabase returns a malformed row" has low likelihood today (you control the cloud, no other writers). But the moment auth ships and multiple users share the cloud — and before RLS is robust — the Supabase response IS user-controlled input. Zod at the boundary makes that transition safe.

A note on prompt injection: it's a different shape of injection. There's no parser at the LLM boundary to escape — the LLM interprets everything. The defense is structural ("wrap user data in known tags so the model treats it as data") and behavioural ("output validation, refusal patterns"). See [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) for the four-layer envelope.

## Interview defense

**Q: "Walk me through input validation in your app."**

```
  ┌─ Compliant by default ─────────────────────────────────────────┐
  │  All SQL writes use parameterized binding via expo-sqlite's   │
  │  runAsync(sql, params) API. The user's freeform notes, names, │
  │  set counts — all become bound parameters, never query        │
  │  fragments.                                                    │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ Two exceptions to fix ────────────────────────────────────────┐
  │  1. updateUserLevel interpolates the column name from a       │
  │     `Category` type. TS gates it at compile time; runtime    │
  │     has no validator. Fix: a whitelist map { push:           │
  │     'push_level', ... } and a throw on miss.                  │
  │                                                                │
  │  2. mapper.ts uses r: any and calls JSON.parse without a      │
  │     schema. Today's risk is bounded (you control the cloud), │
  │     but Phase 4 multi-user + missing-RLS-window makes this    │
  │     the attacker's primary write surface. Fix: Zod schemas    │
  │     per row type; safeParse with a log-and-drop on failure.   │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "validate at the boundary; carry typed values inward."

**Q: "Why is column-name interpolation worse than VALUE interpolation?"**

VALUES are bound by the driver — the driver escapes them and the database treats them as data. Column names are part of the query structure; the driver can't bind them, so the only defense is whitelisting before they reach the SQL. If you ever build a query with `${columnFromUser}`, you've opened a sink that prepared statements can't close.

**Q: "TypeScript's `Category` union is union-checked. Isn't that enough?"**

At compile time, yes. At runtime, no. Any value that bypasses TypeScript's view of the world (a JSON.parse, an env var, an `as Category` cast, a misused `any`) reaches the column-name slot unvalidated. The runtime whitelist is cheap and removes the assumption.

## Validate

1. **Reconstruct.** Draw the sink map (SQL, JSON, render, prompt) and mark where each input flows in contrl.
2. **Explain.** Why is `runAsync(sql, params)` safe and `runAsync(\`... ${userInput} ...\`)` not? What does the driver do differently?
3. **Apply.** Write the runtime whitelist for `updateUserLevel`. How does it integrate with the existing TypeScript type?
4. **Defend.** Argue that the mapper's `any` is fine because the Supabase response shape is fixed. Then rebut.

## See also

- [01-trust-boundaries-and-attack-surface.md](./01-trust-boundaries-and-attack-surface.md) — where each sink lives in the boundary map
- [02-authentication-and-authorization.md](./02-authentication-and-authorization.md) — the Supabase response trust assumption depends on RLS
- [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) — prompt injection, the future sink
- `.aipe/study-software-design/06-errors-and-special-cases.md` — the JSON.parse-without-guard issue from a design angle
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — both findings ranked
