# Week-start derivation

**Industry name(s):** Date-floor, period-truncation, calendar arithmetic
**Type:** Industry standard · Language-agnostic

> Given any date, `getWeekStart` returns the YYYY-MM-DD of the **Monday** of the week containing that date. Uses `Date.getDay()` and a modular-arithmetic offset `(getDay() + 6) % 7` to find the Monday. The output is a string key, not a Date — so it's safe to use as a Map key, a SQL primary key, or a JSON value.

**See also:** → [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) · → [08-streak-fold](./08-streak-fold.md)

---

## Why care

You have a timestamp and want to ask "which week did this belong to?" Every analytics dashboard and every billing system has to answer some version of this question. The trick is producing a stable, comparable key — a string, not a Date, because dates compare by reference in JS.

The pattern is **period truncation** — round down a timestamp to the start of its containing period (week, month, quarter). Same shape as Postgres `date_trunc('week', timestamp)`, ClickHouse `toMonday(date)`, and any "group by week" dashboard.

---

## How it works

Compute a Monday-based offset via modular arithmetic, subtract it, format as ISO date.

```typescript
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const offsetFromMonday = (d.getDay() + 6) % 7;  // 0=Mon … 6=Sun
  d.setDate(d.getDate() - offsetFromMonday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
```

`src/lib/game/week-progress.ts` L7–L15.

**Step 1 — Clone the date.** `new Date(date)` copies so the caller's date isn't mutated. `setDate` is destructive.

**Step 2 — Monday-based offset.** `getDay()` returns 0 for Sunday, 6 for Saturday. `(getDay() + 6) % 7` remaps this so Monday = 0, Tuesday = 1, …, Sunday = 6. (Note: `getDate()` returns the day-of-month, 1–31. Easy to confuse, common bug.)

**Step 3 — Subtract offset.** `setDate(d.getDate() - offsetFromMonday)` rolls back to Monday. JavaScript's `Date` handles month/year underflow automatically — subtracting 3 days from April 2nd correctly produces March 30th.

**Step 4 — Format YYYY-MM-DD.** Manual padding because `Date.toISOString()` includes time and timezone (`'2026-04-12T00:00:00.000Z'`). We want just the date portion.

### Why not `date.toISOString().slice(0, 10)`?

`toISOString` formats in UTC, not local time. A user at 11pm Saturday in Pacific time has `date.getDay() === 6` (Saturday local) but `toISOString().slice(0, 10)` would give Sunday's date (since they're already in Sunday UTC). The Saturday session would group into the *wrong* week.

The manual local-time format ensures the week key matches the user's local sense of week. Trade-off: if the user travels across timezones, week boundaries shift. We accept that.

### Composability

`getWeekStart` produces strings. Strings:
- Compare lexicographically the same as chronologically (ISO 8601's whole point).
- Round-trip through SQL, JSON, query strings.
- Are stable Map keys.
- Are easy to log and debug.

The bridge from frontend: this is the same instinct as using stable string IDs for React `key` props — anything that needs equality compared often should be a string, not an object.

---

## Brute force vs optimal — same complexity

```
getWeekStart (taken):                        date-fns startOfWeek (alternative):
─────────────────────────────────────────    ─────────────────────────────────────
const d = new Date(date);                    import { startOfWeek, format } from 'date-fns'
const offsetFromMonday = (d.getDay()+6)%7;   const start = startOfWeek(date, {weekStartsOn: 1})
d.setDate(d.getDate() - offsetFromMonday);   return format(start, 'yyyy-MM-dd')
return `${yyyy}-${mm}-${dd}`;
~9 LOC, no dep                               ~3 LOC, 70KB dependency
```

The library version is shorter to read but adds bundle weight. For two functions (`getWeekStart` and the format) we can write nine lines ourselves.

### Execution trace

```
Input: date = 2026-04-14 (Tuesday)

Step 1: d = new Date(2026-04-14)              // Tue
Step 2: getDay() = 2  (Tuesday)
        offsetFromMonday = (2 + 6) % 7 = 1
Step 3: d.setDate(14 - 1) = setDate(13)       // Monday April 13
Step 4:
  yyyy = 2026
  mm   = '04'  (zero-padded)
  dd   = '13'

Output: '2026-04-13'

────────────────────────────────────────

Edge case: date = 2026-04-01 (Wednesday)  // start of month

Step 1: d = new Date(2026-04-01)
Step 2: getDay() = 3; offsetFromMonday = (3+6)%7 = 2
Step 3: setDate(1 - 2) = setDate(-1)
        → Date rolls back: March 30

Output: '2026-03-30'

────────────────────────────────────────

Edge case: date = 2026-04-13 (Monday)      // already on Monday

Step 1: d = new Date(2026-04-13)
Step 2: getDay() = 1; offsetFromMonday = (1+6)%7 = 0
Step 3: setDate(13 - 0) = setDate(13)      // no change
Step 4: yyyy=2026, mm='04', dd='13'

Output: '2026-04-13'
```

### When brute force is fine

This *is* the brute force. There's nothing simpler unless you're willing to depend on a library.

---

## Period truncation — diagram

```
   Tue 2026-04-14
        │  getDay() = 2 (Tuesday)
        │  offsetFromMonday = (2 + 6) % 7 = 1
        │  setDate(d.getDate() - 1)
        ▼
   Mon 2026-04-13   ← weekStart

         ┌─ Mon ─┬─ Tue ─┬─ Wed ─┬─ Thu ─┬─ Fri ─┬─ Sat ─┬─ Sun ─┐
   offset: 0       1       2       3       4       5       6
         └──────────────┬─────────────────────────────────────────┘
                        │
                       (any of these dates with these offsets
                        all produce weekStart = 2026-04-13)

   (getDay() + 6) % 7 gives offset from Monday; we subtract it to land on Monday.

   Format choice:
   ────────────────────────────────────────────────
   toISOString().slice(0,10)   → UTC, wrong near midnight
   manual yyyy-mm-dd            → local time, correct  ← taken
   date-fns format(...)         → either, depending on config
```

---

## In this codebase

**File:** `src/lib/game/week-progress.ts`
**Function / class:** `getWeekStart(date)`
**Line range:** L7–L15

Callers:
- `useGameState.ts` L83 — `currentWeekStart` for the active week check
- `useGameState.ts` L93 — filtering sessions by current week
- `useGameState.ts` L315 — grouping sessions in `buildWeekHistory`
- `week-progress.ts` L22 — initializing a `WeekProgress`
- `week-progress.ts` L54 — `needsWeekReset` comparison

---

## Elaborate

### Where this pattern comes from

Calendar arithmetic predates computing. The "snap to start of period" operation is in every database (`DATE_TRUNC`, `STARTOFWEEK`, `TRUNC`). The JS-idiomatic version using `setDate` + manual format is what every team without a date library writes.

### The deeper principle

Period keys should be strings, not Dates. Strings compare by value, are stable, and serialize cleanly. Dates compare by reference and have all the timezone footguns of `Date`. Convert from Date to string at the boundary; everything downstream uses strings.

### Where this breaks down

Timezone-sensitive cases. A user logging at 11pm Pacific Saturday is still in Saturday local but already in Sunday UTC. `getWeekStart` uses local time, so the session groups into the right week locally — but if the same user later moves to UTC, the historical sessions don't shift. This is acceptable because the session `date` field is stored as an ISO date string (no time), so the "what day was this" answer is determined at logging time, not at read time.

Other breakpoint: weeks-start-on-Sunday or arbitrary days. Currently hard-coded to Monday (matches `getWeekStart()` in `week-progress.ts`). To switch to a different start day, change the modular offset formula. The switch from Sunday-start to Monday-start was applied via a one-shot SQLite migration in `migrate()` that re-keyed Sunday-shaped `week_progress` rows to their preceding Monday.

### What to explore next

- [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) → consumer of this key
- [08-streak-fold](./08-streak-fold.md) → also iterates by week

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Hand-rolled getWeekStart (taken) │ date-fns startOfWeek (alt)       │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Bundle           │ Zero added                       │ ~10KB (tree-shaken)              │
│ Code volume      │ 9 LOC                            │ 3 LOC + dep                      │
│ Timezone         │ Local (intended)                 │ Configurable                     │
│ Test coverage    │ Need to write tests              │ Library-tested                   │
│ Format choice    │ Hard-coded yyyy-mm-dd            │ Configurable                     │
│ Maintenance      │ One function we own              │ Library version drift            │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *no library-tested edge cases*. date-fns handles DST transitions, leap-second weeks, locale-specific weekStartsOn — we don't test any of those. We accept the limitation because: (a) the app is single-locale (no UI for other weekstarts yet), (b) DST shifts don't move the day-of-week, and (c) leap seconds are a SQL/JS-level abstraction.

### Sub-block 2 — what date-fns would have cost

A new dependency, ~10KB of bundle even with tree-shaking, and learning the library's API. For one function we use in five places, the inline version is lighter overall.

### Sub-block 3 — the breakpoint

Fine until we ship a "weekstart preference" feature (user chooses Sunday or Monday). At that point we'd parameterize `getWeekStart(date, weekStartsOn)` and the test surface grows. date-fns might be worth its weight then.

### Sub-block 4 — what wasn't actually a tradeoff

Using `toISOString` was not picked because of the UTC vs local-time issue. It would have been one line shorter but produced wrong week keys for users near midnight in non-UTC timezones.

---

## Tech reference (industry pairing)

### Native `Date` (getDay/setDate, local-time getters)

- **Codebase uses:** `getWeekStart` (`week-progress.ts` L7–15) — `(d.getDay() + 6) % 7` for the Monday offset, `setDate` for the rollback (auto-handles month/year underflow), `getFullYear`/`getMonth`/`getDate` for a local-time `YYYY-MM-DD`.
- **Why it's here:** the standard library already does calendar arithmetic correctly; a 9-line function avoids a date-library dependency for one operation used in five places.
- **Leading today:** native `Date` for simple period truncation — `adoption-leading`, 2026.
- **Why it leads:** zero bundle cost, no version drift; `setDate` underflow handling removes the hard part.
- **Runner-up:** date-fns `startOfWeek(date, { weekStartsOn: 1 })` + `format` — terser and library-tested for DST/locale edge cases; earns its weight once a user-configurable week-start ships.

### String period keys (vs Date objects)

- **Codebase uses:** `getWeekStart` returns `'YYYY-MM-DD'` strings used as Map keys, the `week_progress.week_start` SQL primary key, and JSON values.
- **Why it's here:** strings compare by value (ISO 8601 sorts lexicographically = chronologically); Dates compare by reference and carry timezone footguns.
- **Leading today:** ISO date-strings as period keys — `adoption-leading` (language-agnostic), 2026.
- **Why it leads:** stable equality, clean serialization across SQL/JSON/query-strings, trivially loggable.
- **Runner-up:** epoch-ms numbers — also value-comparable, but lose human readability and the natural `date_trunc`-style grouping a date-string gives.

---

## Summary

### Concept recap

`getWeekStart(date)` clones the input date, computes `(getDay() + 6) % 7` to get a Monday-based offset, subtracts that many days to land on Monday, and formats `YYYY-MM-DD` using local-time getters (`getFullYear`, `getMonth`, `getDate`). The result is a stable string usable as a Map key, SQL primary key, or JSON value. The constraint forcing this design was: avoid library dependency for a small function; produce string keys for stable comparison; use local time to match user-perception week boundaries. The cost is needing to maintain our own test coverage.

### Key points

- `(getDay() + 6) % 7` maps JS day-of-week (0=Sun…6=Sat) to a Monday-based offset (0=Mon…6=Sun).
- Subtracting the offset lands on the Monday of the week containing the input.
- The output is a string, not a Date — safe for Map keys and SQL.
- Local time is intentional; UTC would shift week boundaries near midnight.
- Cloning the date (`new Date(date)`) avoids mutating the caller's value.

---

## Interview defense

### Likely questions

**Q: Walk me through the function.  [mid]**
A: Take the input date, clone it (to avoid mutating the caller's), compute `(getDay() + 6) % 7` to get a Monday-based offset, then `setDate(getDate() - offset)` rolls the cloned date back to Monday. Format YYYY-MM-DD with zero-padded month and day, return as a string.

```
Tue 2026-04-14  ──► getDay() = 2  ──► offsetFromMonday = (2+6)%7 = 1
                                       setDate(14 - 1) = setDate(13)
                                                            │
                                                            ▼
                                                     Mon 2026-04-13
                                                            │
                                                            ▼
                                                     '2026-04-13'
```

**Q: Why not `toISOString().slice(0, 10)`?  [senior]**
A: `toISOString()` formats in UTC. A user logging at 11pm Pacific Saturday has `getDay() === 6` (Saturday locally), but `toISOString().slice(0, 10)` returns Sunday's date (because they're already in Sunday UTC). The session would group into the wrong week. The manual local-time format keeps the week key aligned with the user's perception of "what day is it".

```
   UTC format (broken near midnight)     │   Local format (taken)
   ────────────────────────────────────  │   ────────────────────────────
   user clocks 11pm Sat (local)          │   user clocks 11pm Sat (local)
   → toISOString → '2026-04-12T07:00:00Z'│   → manual format → '2026-04-11'
   → '2026-04-12'  (wrong: it's Sunday)  │   → correct: Saturday's week
```

**Q: How does this scale to a globally-distributed user base?  [arch]**
A: Each user's week key is in their local timezone at the time of logging. Once stored, the key never changes (the session's `date` is a string, not a recomputed value). So even if a user moves from Pacific to Tokyo, historical sessions keep their original week keys. Future sessions group into Tokyo-local weeks. The only consistency we lose is "is this user 'on the same week' as another user across timezones" — but we don't care about that.

```
┌─ at global scale ──────────────────────────────────────────┐
│  per-user week consistency        ✓ within their timezone  │
│  cross-user week comparison       ✗ week-of-2026-04-12 in  │
│                                     LA differs from Tokyo  │
│  fix if cross-user matters:       store user_timezone +    │
│                                   recompute on read        │
└────────────────────────────────────────────────────────────┘
```

### One-line anchors

- `(getDay() + 6) % 7` gives Monday-based offset; subtract to land on Monday.
- Use local time; UTC shifts boundaries.
- Output strings, never Dates.
- Cloning prevents `setDate` from leaking.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the day-of-week table and a Wed → Sun transition.

### Level 2 — Explain it out loud
Why not `toISOString`? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add `getMonthStart(date)`. Same shape?"

Reference `week-progress.ts` L7.

### Level 4 — Defend the decision you'd change
"Switch to Sunday-start weeks. What changes?"

### Quick check — code reference test
- What file has `getWeekStart`?
- What formula converts `getDay()` to a Monday-based offset?
- Why clone the date first?

Then verify.

---
Updated: 2026-05-17 — Algorithm switched from Sunday-start to Monday-start; modular-arithmetic offset `(getDay()+6)%7`; one-shot SQLite migration re-keys legacy Sunday rows.
Updated: 2026-05-29 — Added Tech reference section (native Date / string period keys) per v1.42.0. Refreshed caller line refs: useGameState L85→L83, L96→L93, L333→L315; week-progress needsWeekReset L56→L54. (getWeekStart L7–15, createWeekProgress L22 accurate.)
