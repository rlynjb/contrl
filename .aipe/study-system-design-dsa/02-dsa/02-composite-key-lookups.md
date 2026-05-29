# Composite key lookups

**Industry name(s):** Composite primary key, compound key, multi-column key
**Type:** Industry standard · Language-agnostic

> Gates and drafts are identified by `${category}:${level}` — a concatenation that lets us treat the two-dimensional addressing as a one-dimensional string key. Same shape in SQL (`PRIMARY KEY id` with the concatenated string) and in JS (`Record<string, GateProgress>`).

**See also:** → [01-system-design/05-derived-state](../01-system-design/05-derived-state.md) · → [01-system-design/02-sqlite-as-source-of-truth](../01-system-design/02-sqlite-as-source-of-truth.md)

---

## Why care

You have data addressed by two attributes — like a spreadsheet cell at column C, row 5. You could store it as a 2D array `cells[C][5]` or as a flat map keyed by `"C5"`. The flat version is one lookup, no nested-null check. That's the trick.

The pattern is **composite key lookup** — combine multiple values into one key, then use a flat data structure (hashmap, single-column index) instead of a nested one. Same shape as SQL composite primary keys, Redis namespaced keys (`user:42:profile`), and DynamoDB partition+sort keys. It's mundane and load-bearing.

---

## How it works

Two attributes, one address. Instead of `gates[category][level]` (nested objects, harder to iterate), we use `gates['push:3']` (flat map, trivial iteration). The trade is "you make the key, I'll do the rest in O(1)".

### Key construction

```typescript
function gateKey(category: Category, level: number) {
  return `${category}:${level}`;
}
```

`src/hooks/useGameState.ts` L55. One helper that every gate operation uses. The colon is arbitrary but standard — it's not a value that ever appears inside `category` or `level`, so the parse is unambiguous.

For the SQLite side, the same string is the primary key:

```typescript
const id = `${gp.category}:${gp.level}`;
await d.runAsync(
  `INSERT OR REPLACE INTO gate_progress (id, level, category, ...)`,
  [id, gp.level, gp.category, ...]
);
```

`src/services/database.ts` L481–L486. Both `level` and `category` are *also* stored as separate columns, which seems redundant — but the redundancy is intentional. The composite `id` is the lookup key; the separate columns let SQL `WHERE category = ?` queries use a regular index.

### Lookup

```typescript
// JS side
const gate = gateProgress[gateKey(category, level)] ?? null;

// SQL side
await d.getFirstAsync('SELECT * FROM gate_progress WHERE id = ?', [`${category}:${level}`]);
```

Both are O(1) — hashmap lookup in JS, primary-key index seek in SQLite.

### Why a string concat instead of a tuple?

JavaScript doesn't have value-equality on objects, so `gates[{cat:'push', level:3}]` would convert the object to `'[object Object]'` and collide with every other object key. Strings are the lingua franca of JS map keys. Symbols would work but can't be persisted to SQLite. Concatenated strings round-trip cleanly through any storage.

### Same shape, two places

```
┌─ JS state ────────────────────────┐    ┌─ SQLite ──────────────────────────────┐
│  gateProgress:                    │    │  gate_progress table                  │
│    Record<string, GateProgress>   │    │  PRIMARY KEY id TEXT                  │
│                                   │    │                                       │
│  gateProgress['push:1'] = {...}   │    │  INSERT id='push:1', level=1,         │
│  gateProgress['push:2'] = {...}   │    │         category='push'               │
│  gateProgress['squat:1'] = {...}  │    │                                       │
└───────────────────────────────────┘    └───────────────────────────────────────┘
                       ↑                                  ↑
                       └────── same key, same shape ──────┘
```

The same `${cat}:${level}` works as a JS object key, a SQLite row ID, and (with a different separator) a Notion page property. One mental model across three layers.

---

## Brute force vs optimal

```
Composite key (taken)            Nested objects (alternative)
─────────────────────────────    ─────────────────────────────
gates[`${cat}:${lvl}`]            gates[cat]?.[lvl]
O(1) lookup                       O(1) lookup (same complexity)
                                  ?. needed for missing cat
                                  Object.values(gates).flat() for iter
```

The two patterns have identical complexity. The win for composite key is *ergonomics*:
- Flat iteration (`Object.values(gates)`) gives every gate; nested needs flatMap.
- No nullish check on missing first-level key.
- SQL maps cleanly to a single primary-key column.

### Execution trace

```
operation: get gate for (push, level 3)

   key = gateKey('push', 3)
   key = `push:3`

JS map lookup:
   gateProgress['push:3']
   hashmap.get('push:3')              ←  O(1)
   → returns GateProgress { ... }

SQL lookup:
   SELECT * FROM gate_progress WHERE id = 'push:3'
   B-tree seek on primary key index   ←  O(log n) but typically O(1) for small n
   → returns row
```

### When brute force is fine

With ≤ 15 gates per user (5 levels × 3 categories), full iteration is fast. Nested objects work too. The composite-key choice is about *consistency* between JS and SQL representations more than about performance.

---

## Composite key — diagram

```
   inputs
   ┌──────────────────┐    ┌─────────────────┐
   │ category 'push'  │    │ level 3         │
   └────────┬─────────┘    └────────┬────────┘
            │                       │
            └───────────┬───────────┘
                        │
                        ▼
                  template literal:
                  `${category}:${level}`
                        │
                        ▼
                   composite key
                  ────────────────
                     "push:3"
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
   ┌──────────────────┐    ┌──────────────────┐
   │  JS map          │    │  SQLite          │
   │  gates['push:3'] │    │  WHERE id='push:3'│
   └──────────────────┘    └──────────────────┘
```

---

## In this codebase

**Files / functions:**
- `src/hooks/useGameState.ts` L55 `gateKey(category, level)`
- `src/services/database.ts` L478 `updateGateProgress` constructs `id = ${gp.category}:${gp.level}`
- `src/services/database.ts` L434 `getGateProgress` queries by `WHERE id = ?`
- `src/services/database.ts` L566 `getDraft` uses `draft:${category}:${level}`
- `src/lib/game/reconstruct.ts` L24 `getGate(cat, level)` uses `${cat}:${level}` for the in-memory accumulator

---

## Elaborate

### Where this pattern comes from

Composite keys are as old as databases. SQL has supported `PRIMARY KEY (col1, col2)` since SQL-86. The "flat string concatenation" variant became idiomatic in NoSQL stores (Redis, DynamoDB) where the storage system only supports single-string keys. In JS, the lack of value-equality on objects made string concatenation the de facto pattern.

### The deeper principle

A flat key space is easier to iterate, store, transport, and reason about than a nested one. If you have N attributes that together identify a row, encode them into one key string and use the simplest possible storage shape (hashmap, SQL primary key). Save the structural typing for the *value*, not the *key*.

### Where this breaks down

When attribute count grows past 3–4, the concatenated key becomes hard to read and parse. At that point a tuple-like representation (a JSON object as a string, or a dedicated key class) is clearer. We have 2 attributes (category, level) plus optionally a prefix for namespacing — clear.

The other breakpoint: when the separator character can appear in attribute values. Colon-separated `id` would break if a future `category` value contained a colon. Since `Category` is a typed union `'push' | 'pull' | 'squat'`, this can't happen — the type system constrains it.

### What to explore next

- [01-system-design/02-sqlite-as-source-of-truth](../01-system-design/02-sqlite-as-source-of-truth.md) → how SQLite primary keys work
- [04-grouping-sessions-by-week](./04-grouping-sessions-by-week.md) → composite key used for grouping

---

## Tradeoffs

```
┌──────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension   │ Composite string key (taken)     │ Nested objects (alternative)     │
├──────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Lookup           │ O(1)                             │ O(1) per level, ?. chain         │
│ Iteration        │ Object.values()                  │ flatMap over first level         │
│ JS↔SQL parity    │ Same key everywhere              │ Need to flatten for SQL          │
│ Type safety      │ Loses structure                  │ Preserves structure              │
│ Parsing back     │ split(':') if needed             │ Already structured               │
│ Separator collisn│ Risk if value contains separator │ N/A                              │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is *type safety on the key*. `'push:3'` is just a string; there's no compile-time check that the two parts are valid. A typo (`'pussh:3'`) compiles fine but produces no gate. The mitigation is the `gateKey` helper that constrains inputs to `Category` and `number` — anyone who imports the helper gets the type check, but a raw template literal anywhere else bypasses it.

The second cost is *parsing back*. If we ever need to extract `category` and `level` from an id, we have to `split(':')` and re-typecheck. Today we never do this; the row also stores `category` and `level` as separate columns, so reads can use those directly.

### Sub-block 2 — what nested objects would have cost

A nested `Record<Category, Record<number, GateProgress>>` would preserve type structure but require nullish-chaining (`gates[cat]?.[level]`), nested initialization (`gates[cat] = gates[cat] ?? {}; gates[cat][level] = ...`), and a custom iterator to flatten for `Object.values`. The SQL side would still need a flat key (rows have one primary key), so we'd convert between the two on every persist/load — more code, more bugs, no benefit.

### Sub-block 3 — the breakpoint

Fine until attribute count exceeds 3–4 or until any attribute's value space can contain the separator. Both are out of scope here.

### Sub-block 4 — what wasn't actually a tradeoff

A SQL-style tuple primary key (`PRIMARY KEY (category, level)`) was not picked because we'd still need a string-shaped lookup key from JS — the underlying SQL form is irrelevant if the JS layer treats keys as strings.

---

## Tech reference (industry pairing)

### SQLite TEXT PRIMARY KEY

- **Codebase uses:** `gate_progress.id TEXT PRIMARY KEY` holding `${category}:${level}`; `drafts.id` holding `draft:${category}:${level}`. Lookup via `WHERE id = ?` in `getGateProgress` (`database.ts` L434) and `getDraft` (L566).
- **Why it's here:** a single-column primary key is the simplest round-trippable key shape, and SQLite seeks it via a B-tree index in effectively O(1) at this scale.
- **Leading today:** SQLite TEXT primary key — `adoption-leading` for single-column composite keys on mobile, 2026.
- **Why it leads:** maps 1:1 to the JS string key; no join, no compound-index bookkeeping; the redundant `category`/`level` columns cover range queries.
- **Runner-up:** SQL tuple key `PRIMARY KEY (category, level)` — first-class compound key, but the JS layer still needs a string, so the conversion buys nothing here.

### JS template literals + `Record<string, T>`

- **Codebase uses:** `gateKey()` (`useGameState.ts` L55) builds the key; `gateProgress: Record<string, GateProgress>` is the in-memory hashmap; `reconstruct.ts` L24 uses the same key for its accumulator.
- **Why it's here:** JS objects compare keys by string value, so a concatenated string gives value-equality for free — what a `Map` keyed on an object cannot.
- **Leading today:** template-literal string keys — `adoption-leading` for JS composite map keys, 2026.
- **Why it leads:** zero allocation beyond the string, value-equality semantics, round-trips cleanly to SQLite and back.
- **Runner-up:** `Map` with interned object keys — preserves structure but needs a key-interning cache to get value-equality; more code for no gain at 2 attributes.

---

## Summary

### Concept recap

Two attributes (`category`, `level`) get concatenated into one string key (`${category}:${level}`). The result is used as both the JS map key (in `gateProgress: Record<string, GateProgress>`) and the SQLite primary key (`gate_progress.id`). One key, three layers, O(1) lookup everywhere. The constraint forcing this was JS's lack of value-equality on object keys plus the need to round-trip through a single-column SQL primary key. The cost is the loss of compile-time structural typing on the key itself.

### Key points

- One helper (`gateKey`) is the convention; bypass it and you lose the type check.
- Both `category` and `level` are also stored as separate columns to support indexed `WHERE` queries.
- The colon is safe because `Category` is a typed union with no colon-containing values.
- Same pattern: `gate:push:3`, `draft:push:3`, etc — prefix-namespaced composite keys.

---

## Interview defense

### Likely questions

**Q: Why a string concatenation instead of a `Map` keyed on an object?  [mid]**
A: `Map` would work but it requires reference-equality on the key — two different objects with the same `{category, level}` would be different keys. We'd need to either intern keys (extra allocation) or accept that lookups are by identity, not by value. Strings give us value-equality for free. The cost is parsing back if needed; we don't.

```
   String concat (taken)              │   Map with object key (alternative)
   ────────────────────────────────── │ ──────────────────────────────────────
   gates['push:3']                    │   gates.get({category: 'push', level: 3})
   value-equality                     │   reference-equality — fails
   round-trips through SQL            │   need to encode to string anyway
```

**Q: Why store `category` and `level` as separate columns AND as the composite id?  [senior]**
A: The composite `id` is for direct lookups (`WHERE id = 'push:3'`). The separate columns are for indexed range queries (`WHERE category = 'push'` for all gates in that category, or `WHERE level = 3` for all gates at L3). Without the separate columns, those queries would require pattern matching on the id (`WHERE id LIKE 'push:%'`), which can't use a regular index efficiently. The redundancy costs ~10 bytes per row and unlocks both query patterns.

```
   Composite id only (would work)        │   id + separate cols (taken)
   ──────────────────────────────────── │ ────────────────────────────────────
   SELECT by id          O(log n)        │   SELECT by id           O(log n)
   SELECT by category    LIKE 'push:%'   │   SELECT by category     indexed
   SELECT by level       index unhelpful │   SELECT by level        indexed
```

### One-line anchors

- One key, three layers.
- Strings give value-equality; objects don't.
- The redundant columns are for range queries.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch how the same key flows from JS to SQL.

### Level 2 — Explain it out loud
Why string concatenation? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a `setlist:${date}` outbox table that holds a planned workout for a date." What does the key look like, and which queries become easy/hard?

Reference `database.ts` L443–L448.

### Level 4 — Defend the decision you'd change
"Would you ever switch to a typed key class?" When would that earn its place?

### Quick check — code reference test
- What file has `gateKey`?
- What separator is used?
- What's the SQLite column name?

Then verify.

---
Updated: 2026-05-29 — Added Tech reference section (SQLite TEXT PRIMARY KEY / JS template-literal keys) per v1.42.0. Refreshed drifted refs: gateKey useGameState L56→L55, updateGateProgress L443→L478 (INSERT L481–486), getGateProgress L402→L434, getDraft L526→L566. (reconstruct getGate L24 accurate.)
