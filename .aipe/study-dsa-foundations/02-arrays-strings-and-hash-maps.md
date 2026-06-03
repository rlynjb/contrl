# 02 — Arrays, strings, and hash maps

**Indexed sequences, string buffers, hash tables / `Record<K, V>` / `Set` / `Map`** — Industry standard.

## Zoom out, then zoom in

These three structures carry 90% of the real work in any app. Arrays for ordered things, strings for text, hash maps for lookups. The interview signal isn't "do you know what a hash map is" — it's "do you reach for the right one without thinking, and do you know its failure modes?"

```
  Zoom out — where these structures live in contrl

  ┌─ UI layer ───────────────────────────────────────────────────┐
  │  SessionList renders sessions[]   ← array.map()              │
  │  WeekProgress shows {push, pull, squat} ← Record<K, bool>    │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Pose layer ──────────────▼──────────────────────────────────┐
  │  landmarks: Landmark[33]  ← fixed-size array, hot path       │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Game / state layer ──────▼──────────────────────────────────┐
  │  ★ THIS CHAPTER ★                                            │
  │  userLevels: Record<Category, number>                        │
  │  gateProgress: Record<string, GateProgress>  ← composite key │
  │  sessions: WorkoutSession[]   ← linear scans, sorts          │
  │  weekHistory: WeekProgress[]  ← streak walk                  │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Storage layer ───────────▼──────────────────────────────────┐
  │  AsyncStorage: key → string (hash map of blobs)              │
  │  SQLite: rows (arrays) + indexes (B-trees)                   │
  └──────────────────────────────────────────────────────────────┘
```

These are the structures every other chapter assumes you have fluent. They're also the structures every interview problem reduces to once you strip away the framing.

## Structure pass

**Layers.**

- **Array** — contiguous indexed memory; O(1) index, O(n) search-by-value, O(n) insert-middle.
- **String** — immutable array of code units. Same cost profile as arrays for the operations that matter.
- **Hash map** — key → value via hash function; O(1) average lookup, O(n) worst-case, no ordering guarantee.
- **Set** — hash map where you only care about presence; O(1) membership test.

**Axis traced — access pattern (how do you find the thing?).**

```
  axis = "how do you locate the element you want?"

  array:    by index (you know its position)        → O(1)
  array:    by value (you don't)                    → O(n) scan
  hash map: by key                                  → O(1) average
  hash map: by value                                → O(n) — same as array
  string:   by index (codepoint position)           → O(1) (mostly; UTF-16 caveats)
  string:   by substring                            → O(n × m) naive, O(n+m) KMP
```

**Seams.** The boundary that flips the axis-answer is **"do you know how to find it?"**. If you have the key, hash map. If you have the index, array. If you have a *predicate*, you're stuck with O(n) on either — the data structure can't help you. That's why secondary indexes exist (you build a second hash map keyed by the predicate's input).

## How it works

### Move 1 — the mental model

An array is a row of slots numbered 0..n-1; indexing is "go to slot k, read it." A hash map is a function from a key (any type that hashes) to a slot; the magic is the hash function. A string is "an array of characters, but immutable."

```
  Pattern — the three shapes

  Array: contiguous, indexed

    [  3  ][  1  ][  4  ][  1  ][  5  ][  9  ][  2  ][  6  ]
       0     1     2     3     4     5     6     7
       └─── O(1) jump: address = base + (index × element_size)

  Hash map: key → slot via hash function

           hash("push")  → 17
           hash("pull")  → 03         ┌──────────────────┐
           hash("squat") → 42  ───►   │ slot 03: pull→T  │
                                      │ slot 17: push→F  │
                                      │ slot 42: squat→F │
                                      └──────────────────┘

  String: immutable array of code units

    "push" → ['p']['u']['s']['h']  (UTF-16 code units, not characters)
              0    1    2    3
```

The mental hook for hash maps: **the hash function picks the slot.** A good hash spreads keys evenly across slots; a bad hash piles them into one slot and your "O(1)" becomes O(n).

### Move 2 — the moves you'll make

#### Array indexing and the cache argument

The reason arrays are fast isn't just "O(1) index" — it's that consecutive elements are *contiguous in memory*, which makes the CPU cache happy.

```
  Pattern — sequential vs. random access

  sequential scan over an array:
    [a][b][c][d][e][f][g][h]
     ▲▲▲▲▲▲▲▲                  ← cache prefetches the next chunk;
     │  each ▲ is one access      consecutive reads are nearly free

  random access via "next pointer" (linked list):
    [a]→ ... [d]→ ... [g]→ ... [b]→ ...
     ▲        ▲        ▲        ▲     ← each access is a cache miss;
     each one fetches a fresh         100× slower than the sequential
     cache line                         version even at "O(n)" each
```

This is why the rule of thumb is "default to arrays." Linked lists have nicer insert-middle complexity (O(1) vs O(n)) but their actual performance on modern hardware is usually worse because they scatter across memory.

#### Hash function and collision handling

Two keys can hash to the same slot. That's a collision, and how the data structure handles it determines the worst-case cost.

```
  Pseudocode — hash map insert with separate chaining

  function insert(map, key, value):
    h = hash(key) mod len(map.buckets)
    bucket = map.buckets[h]
    for each (k, v) in bucket:                 // walk the chain
      if k == key:
        update v to value                       // overwrite
        return
    bucket.append((key, value))                 // append if new
    if (len(items) / len(buckets)) > LOAD_LIMIT:
      resize_and_rehash(map)                    // amortized O(1)
```

Two collision strategies are standard:

- **Separate chaining** — each slot holds a linked list (or array) of entries that hashed there. Worst-case lookup is O(n) if all keys collide.
- **Open addressing** — on collision, probe forward to the next empty slot. Worst-case is still O(n) but cache behavior is better in practice.

JS engines use open addressing internally. You don't pick.

#### Load factor and resizing

A hash map with too many entries per bucket degrades. Engines resize when load (entries / buckets) crosses a threshold.

```
  Execution trace — hash map resize

  load_factor = entries / buckets

  state 0:  buckets=4,  entries=0   load=0     all ops O(1)
  insert 4 keys: buckets=4, entries=4 load=1.0  chains forming
  insert 5th: buckets=4, entries=5  load=1.25  resize triggered
                                                ↓
              buckets=8, entries=5  load=0.625 (amortized O(1) growth)
              all keys re-hashed into new bucket array       ↑
                                                              │
                                       this is the O(n) op that
                                       averages to O(1) over time
```

Same amortized-cost lesson as `array.push`. Most inserts are O(1); occasionally one triggers a resize that's O(n); over a long sequence, the average per-op is still O(1).

#### `Set` vs `Map` vs `Record<K, V>`

JS gives you four flavors of "key-value store" and they're not interchangeable.

```
  Comparison — the four flavors

  ┌──────────────┬───────────────────────┬───────────────────────────────┐
  │              │ key type              │ when you reach for it         │
  ├──────────────┼───────────────────────┼───────────────────────────────┤
  │ {} (plain    │ string only (coerced) │ JSON-shaped data, serializable│
  │  object)     │                       │                               │
  │ Record<K, V> │ TS-typed string       │ same as {}, but type-safe     │
  │  (TS type)   │ literal union         │                               │
  │ Map          │ any value (including  │ keys aren't strings; need     │
  │              │ objects as keys)      │ iteration order; perf-sensitive│
  │ Set          │ presence-only         │ membership test, dedup        │
  └──────────────┴───────────────────────┴───────────────────────────────┘
```

In `contrl`, `userLevels: Record<Category, number>` is the type-safe version of `{}`. `Category` is a string literal union (`'push' | 'pull' | 'squat'`); TS enforces you can't index by anything else.

#### String operations and the immutability tax

Strings in JS are immutable. Concatenation builds a new string, which is O(n+m) in time and space.

```
  Pattern — the quadratic string-build trap

  // BAD: O(n²) — each += copies the whole accumulated string
  let s = ""
  for (const word of words):
    s += word                  // O(|s|) — grows each iteration

  // GOOD: O(n) — array push is amortized O(1), join is O(n) once
  const parts = []
  for (const word of words):
    parts.push(word)
  const s = parts.join("")
```

Modern engines optimize repeated `+=` with "string ropes" but you can't rely on it. Build with arrays; join at the end.

#### Composite keys

Sometimes you need to index by two things at once. Two standard moves:

```
  Pseudocode — composite key strategies

  // Strategy 1: string-concat the parts (what contrl does)
  key = category + ":" + level         // "push:3"
  gates[key] = gateProgress

  // Strategy 2: nested map
  gates[category][level] = gateProgress

  // Strategy 3: Map with object keys
  gates.set({ category, level }, gateProgress)
  // ↑ DOESN'T WORK as expected — object identity, not value equality
  //   different {category:"push", level:3} objects are different keys
```

Strategy 1 is the most portable and trivially debuggable (the key is a human-readable string). Strategy 2 makes the hierarchy explicit but doubles the lookup cost. Strategy 3 is the trap people fall into.

### Move 3 — the principle

**Arrays for order, hash maps for lookup, sets for membership.** The choice is determined by *the question you're trying to answer*. "Give me item k" → array. "Do I have key K?" → hash map or set. If you find yourself doing nested `.find()` calls inside a loop, you've picked an array when you needed a map.

## Primary diagram

```
  The full picture — three structures, three access patterns

  ┌─ Array ──────────────────────────────────────────────────┐
  │   contiguous memory · O(1) index · O(n) search-by-value  │
  │   cache-friendly · default choice                        │
  │   [ a ][ b ][ c ][ d ][ e ]                              │
  │     0    1    2    3    4    ← position is the key       │
  └──────────────────────────────────────────────────────────┘

  ┌─ Hash map ───────────────────────────────────────────────┐
  │   key → bucket via hash() · O(1) average · O(n) worst    │
  │   no order · resize on load factor                       │
  │     "push" ──hash──► slot 7  → value                     │
  │     "pull" ──hash──► slot 3  → value                     │
  └──────────────────────────────────────────────────────────┘

  ┌─ Set ────────────────────────────────────────────────────┐
  │   hash map with no values · membership only              │
  │     "completed" ∈ set?   O(1) yes/no                     │
  └──────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### Use cases

- **Categories as a hash-map domain.** `'push' | 'pull' | 'squat'` is the universe of keys. Anywhere `contrl` tracks state per category, it uses `Record<Category, T>` — the TS-narrowed flavor of `{}`.
- **Composite gate key.** `reconstruct.ts` builds `${cat}:${level}` to index a flat `Record<string, GateProgress>` — strategy 1 above. Trades nested structure for trivial debuggability.
- **Sessions as an array.** Sessions are inherently ordered (by date), so they live in `WorkoutSession[]` and get scanned linearly or sorted before iteration.
- **Week bucketing.** `getWeekStart()` turns a `Date` into a `YYYY-MM-DD` string; that string is a hash-map key.

### Code side by side

```
  src/lib/game/reconstruct.ts (lines 24-30)

  const getGate = (cat, level): GateProgress => {
    const key = `${cat}:${level}`              ← composite key
    if (!gates[key]) {                          ← O(1) hash lookup
      gates[key] = createGateProgress(...)     ← O(1) insert
    }
    return gates[key]
  }
       │
       └─ classic "memoization through a hash map": first access
          computes + stores, subsequent accesses just read. The
          composite key `${cat}:${level}` is strategy 1 — flat
          string-concat over a nested {push: {1: ..., 2: ...}}.
          Easier to debug ("squat:5" tells you everything) and
          serializable as-is.
```

```
  src/lib/game/week-progress.ts (lines 7-15)

  export function getWeekStart(date: Date): string {
    const d = new Date(date)
    const offsetFromMonday = (d.getDay() + 6) % 7    ← 0=Mon, 6=Sun
    d.setDate(d.getDate() - offsetFromMonday)        ← snap to Monday
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`                     ← the bucket key
  }
       │
       └─ this function does ONE job: turn an arbitrary Date into a
          canonical week-key. The string format `YYYY-MM-DD` sorts
          correctly lexicographically (a property of ISO date format)
          which means downstream code can compare week-keys with `<`
          without parsing back to dates.

          The key shape IS the data structure decision. A different
          string format (`MM/DD/YYYY`) would break lex sorting.
```

```
  src/lib/game/reconstruct.ts (line 17-19)

  const sorted = [...sessions].sort(             ← spread = defensive copy
    (a, b) => new Date(a.date).getTime()           don't mutate caller's
                  - new Date(b.date).getTime()     array
  )
       │
       └─ array-vs-map decision visible here. Sessions live in an
          array because we need ORDER. If we'd put them in a map
          keyed by date, we'd have to sort the keys to iterate
          chronologically — same cost, more indirection.
```

## Elaborate

**Hash function quality matters.** A "perfect" hash function for n keys produces n distinct hash values. Most real hash functions don't, so collisions happen. JS's built-in object hash is reasonable for arbitrary strings but adversarial — if an attacker can pick the keys (e.g., user-supplied input becomes a property name), they can force collisions and make your O(1) into O(n). This is "hash flooding" and has caused real CVEs.

**Open addressing vs separate chaining** is mostly a cache-locality vs simplicity tradeoff. V8's hash maps use open addressing with a robin-hood probing scheme. You don't tune this, but understanding it explains why some workloads are surprisingly fast (cache-friendly) and others surprisingly slow (collision-heavy).

**Persistent / immutable arrays** are a different beast — Clojure's vectors, Immer's structural sharing — they trade O(1) update for O(log32 n) update in exchange for cheap copy-on-write. React's reconciliation depends on this kind of structural sharing being cheap.

**Cross-link:** B-tree indexes (the storage-side version of "key → row lookup") live in `study-database-systems/`. Performance-side measurements of these structures live in `study-performance-engineering/`.

## Interview defense

**Q: Walk me through how you decided `gateProgress: Record<string, GateProgress>` instead of a nested map.**

```
  Anchor diagram

  flat:                              nested:
    {                                  {
      "push:1": gate,                    push: { 1: gate, 2: gate, … },
      "push:2": gate,                    pull: { 1: gate, … },
      "pull:1": gate,                    squat: { … }
      …                                }
    }
       │                                   │
       └─ one lookup: O(1)                 └─ two lookups: O(1) × 2,
          key is debuggable string            harder to scan in debugger,
                                              same total cost
```

**Answer:** Flat composite key. Same asymptotic cost as nested, but you can log the key as a string and instantly know what gate you're looking at. Also serializes to JSON without re-mapping. The cost is having to construct the string on every lookup; that's a few ns and doesn't matter at the rates this fires (a few times per session, not per frame).

**Q: What's the worst-case complexity of a hash-map lookup, and when does it bite?**

Anchor: the collision-chain diagram. **Answer:** O(n) when every key hashes to the same bucket. In practice this never happens with a normal hash function on diverse keys; it CAN happen if an attacker can choose keys to force collisions (hash flooding). Defense: salt the hash, or use a hash function that's hard to invert. Not something I'd worry about in `contrl` since keys are typed and bounded.

**Q: Why is `array.push` O(1) but `array.unshift` O(n)?**

Anchor: contiguous memory diagram. **Answer:** Push appends at the tail — no other elements move. Unshift inserts at the head — every existing element must shift right by one slot. n shifts means O(n) per call. If you need head-inserts often, use a deque (chapter 03) or reverse your mental model and push to the tail then `.reverse()` once at the end.

## Validate

1. **Reconstruct.** Without re-reading: name the three flavors of "key-value store" in JS and when you'd reach for each. *(Plain `{}` / `Record<K,V>` for string keys + serializable; `Map` for non-string keys or iteration order; `Set` for membership-only.)*
2. **Explain.** Why does `reconstruct.ts` build `${cat}:${level}` instead of using a nested `Record<Category, Record<number, GateProgress>>`? *(Flat is debuggable, JSON-serializable, and same asymptotic cost.)*
3. **Apply.** A new feature lets users tag workouts with arbitrary string labels. Two queries: "all workouts with tag X" and "all tags for workout Y." Which structures? *(Two hash maps: tag → workoutIds[], workoutId → tags[]. Or one secondary index — doesn't matter; the point is you need TWO structures because each query has a different "key.")*
4. **Defend.** A reviewer suggests changing `gateProgress: Record<string, GateProgress>` to `Map<string, GateProgress>`. Defend or accept. *(Accept if you need: iteration order, frequent clear-all, or expect more than a few hundred entries. Reject for this case — n is tiny (3 categories × 5 levels = 15 max), `Record` gives TS type safety, and JSON serialization is free.)*

## See also

- `01-complexity-and-cost-models.md` — how to compute the O() for these operations.
- `03-stacks-queues-deques-and-heaps.md` — when arrays aren't quite right.
- `04-trees-tries-and-balanced-indexes.md` — when O(log n) ordered lookups beat O(1) hash lookups.
- `study-database-systems/` — B-tree indexes are the storage-side cousin of hash maps.
