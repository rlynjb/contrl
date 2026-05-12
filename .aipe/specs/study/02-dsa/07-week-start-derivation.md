# Week-start derivation

**Industry name(s):** Date-floor, period-truncation, calendar arithmetic
**Type:** Industry standard · Language-agnostic

> Given any date, `getWeekStart` returns the YYYY-MM-DD of the most recent Sunday. Uses `Date.getDay()` (0 = Sunday) and subtracts that many days. The output is a string key, not a Date — so it's safe to use as a Map key, a SQL primary key, or a JSON value.

**See also:** → [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) · → [08-streak-fold](./08-streak-fold.md)

---

## Why care

You have a timestamp and want to ask "which week did this belong to?" Every analytics dashboard and every billing system has to answer some version of this question. The trick is producing a stable, comparable key — a string, not a Date, because dates compare by reference in JS.

The pattern is **period truncation** — round down a timestamp to the start of its containing period (week, month, quarter). Same shape as Postgres `date_trunc('week', timestamp)`, ClickHouse `toMonday(date)`, and any "group by week" dashboard.

---

## How it works

Find the day-of-week (0–6), subtract that many days, format as ISO date.

```typescript
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();           // 0 = Sun … 6 = Sat
  d.setDate(d.getDate() - day);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
```

`src/lib/game/week-progress.ts` L7–L15.

**Step 1 — Clone the date.** `new Date(date)` copies so the caller's date isn't mutated. `setDate` is destructive.

**Step 2 — Day-of-week.** `getDay()` returns 0 for Sunday, 6 for Saturday. (Note: `getDate()` returns the day-of-month, 1–31. Easy to confuse, common bug.)

**Step 3 — Subtract days.** `setDate(d.getDate() - day)` rolls back to Sunday. JavaScript's `Date` handles month/year underflow automatically — subtracting 3 days from April 2nd correctly produces March 30th.

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
getWeekStart (taken):              date-fns startOfWeek (alternative):
─────────────────────────────      ─────────────────────────────────────
const d = new Date(date);          import { startOfWeek, format } from 'date-fns'
const day = d.getDay();            const start = startOfWeek(date, {weekStartsOn: 0})
d.setDate(d.getDate() - day);      return format(start, 'yyyy-MM-dd')
return `${yyyy}-${mm}-${dd}`;
~9 LOC, no dep                     ~3 LOC, 70KB dependency
```

The library version is shorter to read but adds bundle weight. For two functions (`getWeekStart` and the format) we can write nine lines ourselves.

### Execution trace

```
Input: date = 2026-04-15 (Wednesday)

Step 1: d = new Date(2026-04-15)         // Wed
Step 2: day = d.getDay()                  // 3 (Wednesday)
Step 3: d.setDate(15 - 3) = setDate(12)   // Sunday April 12
Step 4:
  yyyy = 2026
  mm   = '04'  (zero-padded)
  dd   = '12'

Output: '2026-04-12'

────────────────────────────────────────

Edge case: date = 2026-04-01 (Wednesday)  // start of month

Step 1: d = new Date(2026-04-01)
Step 2: day = 3
Step 3: setDate(1 - 3) = setDate(-2)
        → Date rolls back: March 29

Output: '2026-03-29'

────────────────────────────────────────

Edge case: date = 2026-04-12 (Sunday)      // already on Sunday

Step 1: d = new Date(2026-04-12)
Step 2: day = 0
Step 3: setDate(12 - 0) = setDate(12)      // no change
Step 4: yyyy=2026, mm='04', dd='12'

Output: '2026-04-12'
```

### When brute force is fine

This *is* the brute force. There's nothing simpler unless you're willing to depend on a library.

---

## Period truncation — diagram

```
   Wed 2026-04-15
        │  day = 3 (Wed)
        │  setDate(d.getDate() - 3)
        ▼
   Sun 2026-04-12   ← weekStart

         ┌─ Sun ─┬─ Mon ─┬─ Tue ─┬─ Wed ─┬─ Thu ─┬─ Fri ─┬─ Sat ─┐
   day:    0       1       2       3       4       5       6
         └──────────────┬─────────────────────────────────────────┘
                        │
                       (any of these dates with these days
                        all produce weekStart = 2026-04-12)

   getDay() returns the offset; we subtract it to land on Sunday.

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
- `useGameState.ts` L85 — `currentWeekStart` for the active week check
- `useGameState.ts` L96 — filtering sessions by current week
- `useGameState.ts` L333 — grouping sessions in `buildWeekHistory`
- `week-progress.ts` L22 — initializing a `WeekProgress`
- `week-progress.ts` L56 — `needsWeekReset` comparison

---

## Elaborate

### Where this pattern comes from

Calendar arithmetic predates computing. The "snap to start of period" operation is in every database (`DATE_TRUNC`, `STARTOFWEEK`, `TRUNC`). The JS-idiomatic version using `setDate` + manual format is what every team without a date library writes.

### The deeper principle

Period keys should be strings, not Dates. Strings compare by value, are stable, and serialize cleanly. Dates compare by reference and have all the timezone footguns of `Date`. Convert from Date to string at the boundary; everything downstream uses strings.

### Where this breaks down

Timezone-sensitive cases. A user logging at 11pm Pacific Saturday is still in Saturday local but already in Sunday UTC. `getWeekStart` uses local time, so the session groups into the right week locally — but if the same user later moves to UTC, the historical sessions don't shift. This is acceptable because Notion stores ISO date strings (no time) for the session `date` field, so the "what day was this" answer is determined at logging time, not at read time.

Other breakpoint: weeks-start-on-Monday. Currently hard-coded to Sunday (`day = getDay()`, `0 = Sunday`). To switch to Monday, we'd subtract `(day === 0 ? 6 : day - 1)`. Not a feature; would be one-line change.

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

## Summary

### Concept recap

`getWeekStart(date)` clones the input date, subtracts `getDay()` days to land on Sunday, and formats `YYYY-MM-DD` using local-time getters (`getFullYear`, `getMonth`, `getDate`). The result is a stable string usable as a Map key, SQL primary key, or JSON value. The constraint forcing this design was: avoid library dependency for a small function; produce string keys for stable comparison; use local time to match user-perception week boundaries. The cost is needing to maintain our own test coverage and a hard-coded Sunday-start.

### Key points

- `getDay()` returns 0–6 with 0 = Sunday.
- Subtracting `day` days lands on the Sunday of the week containing the input.
- The output is a string, not a Date — safe for Map keys and SQL.
- Local time is intentional; UTC would shift week boundaries near midnight.
- Cloning the date (`new Date(date)`) avoids mutating the caller's value.

---

## Interview defense

### Likely questions

**Q: Walk me through the function.  [mid]**
A: Take the input date, clone it (to avoid mutating the caller's), find the day-of-week with `getDay()` (returns 0 for Sunday through 6 for Saturday), then `setDate(getDate() - day)` rolls the cloned date back to Sunday. Format YYYY-MM-DD with zero-padded month and day, return as a string.

```
Wed 2026-04-15  ──► getDay() = 3  ──► setDate(15 - 3) = setDate(12)
                                                            │
                                                            ▼
                                                     Sun 2026-04-12
                                                            │
                                                            ▼
                                                     '2026-04-12'
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

- Day-of-week minus day-of-week lands on the start of the week.
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
"Add Monday-start weeks. What changes?"

### Quick check — code reference test
- What file has `getWeekStart`?
- What's the day-of-week sentinel for Sunday?
- Why clone the date first?

Then verify.
