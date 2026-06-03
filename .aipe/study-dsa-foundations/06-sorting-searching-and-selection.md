# 06 — Sorting, searching, and selection

**Comparison sorts / non-comparison sorts / binary search / selection algorithms** — Industry standard.

## Zoom out, then zoom in

Sort and search are the two most-used algorithms in software. Every list view sorts something. Every database query has a `WHERE` clause that's morally a search. The interview signal is fluency on the trio: pick the right sort for the shape of data, recognize when binary search applies (sorted? answer monotonic in some parameter?), and know when to use selection instead of full sort.

```
  Zoom out — where sorts and searches live in contrl

  ┌─ UI layer ───────────────────────────────────────────────────┐
  │  Session list ordered by date (sorted on render)             │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Service / game layer ────▼──────────────────────────────────┐
  │  ★ THIS CHAPTER ★                                            │
  │  - reconstructFromSessions: .sort() by date (lines 17-19)    │
  │  - calculateStreak: linear scan (streaks.ts:18-28)           │
  │  - completedCount: linear filter (week-progress.ts:62-64)    │
  │  - No binary search anywhere (n too small to matter)         │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Storage layer ───────────▼──────────────────────────────────┐
  │  SQLite uses B-tree index lookups (≈ binary search on disk)  │
  │   for every WHERE clause                                     │
  └──────────────────────────────────────────────────────────────┘
```

`contrl` exercises sort exactly once (the `.sort()` in `reconstruct.ts`) and binary search exactly never. Linear scans cover everything else because `n` is small (sessions per user, weeks of history). This chapter teaches the curriculum — comparison sorts, non-comparison sorts, binary search, selection — and anchors the exercised parts to the real code.

## Structure pass

**Layers.**

- **Comparison sorts** — compare elements; lower bound O(n log n). Quick, merge, heap, insertion, bubble, selection.
- **Non-comparison sorts** — exploit structure (counting, radix); O(n) under constraints.
- **Sequential search** — linear scan; O(n).
- **Binary search** — sorted input; O(log n) by halving the search space.
- **Selection** — k-th smallest / largest; O(n) via quickselect, O(n log k) via heap-of-k.

**Axis traced — work-per-query (how much do you pay per lookup or per ordering operation?).**

```
  axis = "how much work to find/order a single thing?"

  linear search:    O(n)         — every query
  binary search:    O(log n)     — but requires sorted input
  sort then search: O(n log n) once + O(log n) per query
  hash lookup:      O(1) average — but no ordering, no range queries
  k-th smallest:    O(n)         — quickselect, partition-based
  top-K smallest:   O(n log k)   — heap-of-k
  full sort:        O(n log n)   — comparison-based lower bound
```

**Seams.** Two boundaries that flip the axis-answer:

1. **Is the input sorted?** If yes, binary search becomes available. If not, you pay O(n log n) to sort first — only worth it if you'll do many queries.
2. **Do you need the *full* order or just one element?** Selecting the median or top-K is asymptotically cheaper than a full sort.

## How it works

### Move 1 — the mental model

Sorting puts a list in order. Searching finds an element. Selection finds the k-th smallest *without* fully sorting. All three are paid for by *comparisons* in the abstract — the question is how many you do.

```
  Pattern — the comparison-sort lower bound

  to fully sort n distinct elements, you must distinguish among n!
  possible orderings. each comparison gives 1 bit of information.

  comparisons needed ≥ log₂(n!) ≈ n log n (Stirling's approximation)

  → no comparison-based sort can do better than Ω(n log n).
  → mergesort, heapsort hit this bound (worst-case O(n log n)).
  → quicksort hits it average-case (worst case O(n²) with bad pivots).
```

This is one of the few proofs you should remember. It's why "can you sort in O(n)?" is a trick question — yes, with non-comparison sorts under specific constraints.

### Move 2 — the moves you'll make

#### Comparison sorts — the five you should know

```
  Comparison — five sorts at a glance

  ┌────────────┬─────────────┬───────────┬─────────────┬─────────────────┐
  │ sort       │ avg case    │ worst     │ space       │ stable / notes   │
  ├────────────┼─────────────┼───────────┼─────────────┼─────────────────┤
  │ bubble     │ O(n²)       │ O(n²)     │ O(1)        │ stable; pedagog │
  │ insertion  │ O(n²)       │ O(n²)     │ O(1)        │ stable; best for│
  │            │             │           │             │   small n / near-│
  │            │             │           │             │   sorted (O(n)) │
  │ merge      │ O(n log n)  │ O(n log n)│ O(n)        │ stable; safe    │
  │ quick      │ O(n log n)  │ O(n²)     │ O(log n)    │ unstable; fast  │
  │            │             │           │             │   in practice   │
  │ heap       │ O(n log n)  │ O(n log n)│ O(1)        │ unstable; in-   │
  │            │             │           │             │   place + guaran│
  └────────────┴─────────────┴───────────┴─────────────┴─────────────────┘
```

JS's `Array.prototype.sort` uses **Timsort** (hybrid of merge + insertion, optimized for partial ordering in real-world data). It's stable, O(n log n) worst-case, and you should never write your own sort in JS for production.

#### Mergesort — the safe sort

```
  Pseudocode — mergesort (top-down)

  function mergesort(arr):
    if len(arr) ≤ 1: return arr
    mid = len(arr) / 2
    left  = mergesort(arr[0..mid])
    right = mergesort(arr[mid..])
    return merge(left, right)

  function merge(a, b):
    result = []
    i = 0, j = 0
    while i < len(a) and j < len(b):
      if a[i] ≤ b[j]:
        result.append(a[i])
        i += 1
      else:
        result.append(b[j])
        j += 1
    append rest of a; append rest of b
    return result
```

```
  Execution trace — mergesort [4, 1, 3, 2]

  [4, 1, 3, 2]
   └─ split: [4, 1] | [3, 2]
       └─ [4, 1] split: [4] | [1]
           └─ merge: [1, 4]
       └─ [3, 2] split: [3] | [2]
           └─ merge: [2, 3]
       └─ merge [1, 4] + [2, 3]:
              i=0 j=0  1 < 2  → take 1; result=[1]; i=1
              i=1 j=0  4 > 2  → take 2; result=[1,2]; j=1
              i=1 j=1  4 > 3  → take 3; result=[1,2,3]; j=2
              j exhausted     → append 4; result=[1,2,3,4]
```

Stable (equal elements keep their input order), worst-case O(n log n), but needs O(n) extra space for the merge buffer.

#### Quicksort — the fast sort

```
  Pseudocode — quicksort (in-place, Lomuto partition)

  function quicksort(arr, lo, hi):
    if lo >= hi: return
    p = partition(arr, lo, hi)
    quicksort(arr, lo, p - 1)
    quicksort(arr, p + 1, hi)

  function partition(arr, lo, hi):
    pivot = arr[hi]
    i = lo - 1
    for j from lo to hi - 1:
      if arr[j] ≤ pivot:
        i += 1
        swap(arr[i], arr[j])
    swap(arr[i + 1], arr[hi])
    return i + 1
```

The key idea: pick a pivot, partition into "≤ pivot" and "> pivot," recurse on each side. Worst case O(n²) hits when the pivot is always the smallest or largest (already-sorted input with naive pivot choice). Mitigations: random pivot, median-of-three, or use mergesort.

#### Heapsort — the in-place guaranteed sort

Build a max-heap from the array in-place (O(n)), then repeatedly extract-max to the end of the array (O(n log n) total).

```
  Pseudocode — heapsort

  function heapsort(arr):
    buildMaxHeap(arr)                    // O(n)
    for i from len(arr) - 1 down to 1:
      swap(arr[0], arr[i])               // move max to end
      heapifyDown(arr, 0, i)             // restore heap on [0..i-1]
```

Guaranteed O(n log n), in-place (O(1) space), but unstable. In practice slower than quicksort due to cache behavior, but used when worst-case guarantee matters (real-time systems).

#### Insertion sort — surprisingly important

```
  Pseudocode — insertion sort

  function insertionSort(arr):
    for i from 1 to len(arr) - 1:
      key = arr[i]
      j = i - 1
      while j >= 0 and arr[j] > key:
        arr[j + 1] = arr[j]
        j -= 1
      arr[j + 1] = key
```

O(n²) worst, **O(n) on already-sorted input**, O(1) space, stable, **best small-n performance**. Real sort implementations (Timsort, introsort) switch to insertion sort for partitions below ~16 elements because the constant factors win.

#### Non-comparison sorts — when you can do O(n)

```
  Comparison — counting and radix sort

  Counting sort: when values are integers in a small range [0, k]
    - allocate count[k+1], walk input incrementing count[arr[i]],
      then reconstruct the sorted array from counts.
    - O(n + k) time, O(n + k) space.
    - useful when k is small relative to n.

  Radix sort: sort by least-significant digit, then next, etc.
    - d passes of counting sort (one per digit).
    - O(d × (n + k)) where d = number of digits.
    - used for fixed-width integer/string keys.
```

These don't compare elements; they exploit structure. The Ω(n log n) lower bound doesn't apply because it's about comparison-based sorts specifically.

#### Binary search — halving the search space

```
  Pseudocode — binary search (canonical)

  function binarySearch(arr, target):
    lo = 0
    hi = len(arr) - 1
    while lo ≤ hi:
      mid = lo + (hi - lo) / 2         // avoids integer overflow
      if arr[mid] == target: return mid
      if arr[mid] < target:
        lo = mid + 1
      else:
        hi = mid - 1
    return -1                          // not found
```

```
  Execution trace — search for 7 in [1, 3, 4, 7, 9, 12, 15]

  lo  hi  mid  arr[mid]  comparison
  0   6   3    7         == target → return 3
```

The "halving the search space" framing is the load-bearing intuition. After k iterations, the remaining range is n/2ᵏ; you're done when that's 0, i.e., k = log₂(n). Off-by-one errors are the classic bug — the canonical form above (inclusive `hi`, `lo ≤ hi`) is the safest.

#### Binary search on the answer

A bigger pattern: binary-search over a *parameter*, not a list. When you can answer "is the answer ≤ X?" in O(f(n)), binary search over X gives you the actual answer in O(log(range) × f(n)).

```
  Pattern — binary search on answer

  Example: "minimum capacity to ship all packages in D days"

  given weights[] and days D:
    is(capacity):
      simulate shipping with this capacity in days; return total_days ≤ D
    binary search capacity in [max(weights), sum(weights)]
       until lowest where is(capacity) is true.

  → O(n log(sum/n))
```

This is the technique most candidates miss in interviews. If your "answer" is monotonic in some parameter, you can search the parameter.

#### Selection — k-th smallest in O(n)

```
  Pseudocode — quickselect

  function quickselect(arr, k):
    if len(arr) == 1: return arr[0]
    pivot = arr[random index]
    less    = [x for x in arr if x < pivot]
    equal   = [x for x in arr if x == pivot]
    greater = [x for x in arr if x > pivot]

    if k < len(less):
      return quickselect(less, k)
    elif k < len(less) + len(equal):
      return pivot
    else:
      return quickselect(greater, k - len(less) - len(equal))

  // Average: O(n). Worst (bad pivots): O(n²).
  // BFPRT / median-of-medians guarantees O(n) worst case.
```

For top-K (not just k-th), heap-of-K is the standard pick: O(n log k) and uses O(k) memory regardless of stream length.

### Move 3 — the principle

**Sorting is a setup cost paid for downstream queries.** Sort once at O(n log n); query many times at O(log n) each. The break-even is roughly when you'll do more than log(n) queries — below that, linear search wins. Selection is a different problem: if you don't need the order, don't pay for it.

## Primary diagram

```
  The full picture — sort and search decision tree

  do you need ordered output?
       │
       ├─ yes ──► is the data nearly sorted, small (n < ~20), or both?
       │            │
       │            ├─ yes → insertion sort
       │            │
       │            └─ no  → mergesort (stable, guaranteed) or
       │                     quicksort (fast in practice) or
       │                     Array.prototype.sort (Timsort, just use it)
       │
       └─ no ──► do you need k-th smallest only?
                    │
                    ├─ yes → quickselect (avg O(n)) or
                    │        heap-of-k (O(n log k), bounded memory)
                    │
                    └─ no  → are you searching?
                                │
                                ├─ sorted input?  → binary search O(log n)
                                ├─ unsorted, one-shot? → linear O(n)
                                └─ unsorted, many queries? → sort first, then binary
```

## Implementation in codebase

### Use cases

- **Date-ordered fold.** `reconstructFromSessions` (`src/lib/game/reconstruct.ts:17-19`) sorts sessions by date once, then folds in date order to reconstruct gate progress. The sort is mandatory — gates count *consecutive* clean sessions, and the order is the temporal order.
- **Linear filter / count.** `completedCount` in `week-progress.ts:62-64` filters categories. n=3. Big-O is meaningless here; the code is clearer than any alternative.
- **Linear scan with state.** `calculateStreak` in `streaks.ts:18-28` walks weeks left-to-right tracking a running counter. O(n), n ≤ 52 (one year of weeks).
- **No binary search.** `contrl` never reaches for binary search because no array is large enough to make it pay off vs. a linear scan.

### Code side by side

```
  src/lib/game/reconstruct.ts (lines 17-19)

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
       │
       └─ Timsort under the hood. O(n log n) worst case, O(n) on
          already-sorted input (which is the common case if sessions
          arrived in order — the sort is essentially free).

          The `[...sessions]` spread is a defensive copy: `.sort()`
          mutates in place, so without the spread we'd be mutating
          the caller's array. The cost is O(n) extra space.

          Comparator returns a number: negative = a before b,
          positive = b before a, zero = equal. The `Date.getTime()`
          conversion gives milliseconds-since-epoch, so subtraction
          gives a valid comparator without parsing strings.
```

```
  src/lib/game/streaks.ts (lines 18-28)

  export function calculateStreak(history: WeekProgress[]): number {
    let streak = 0
    for (const week of history) {              ← linear scan, O(n)
      if (isWeekComplete(week)) {                 n bounded by year length
        streak += 1                             ← running counter
      } else {
        streak = 0                              ← state machine: reset on miss
      }
    }
    return streak
  }
       │
       └─ a state-machine flavored linear scan. The state is the
          running streak counter; the transition is "complete? +1 :
          reset to 0." Final return is the streak length at end-of-input.

          Note this returns the CURRENT streak (the one at the end of
          history), not the MAX streak in history. If you wanted max,
          you'd track both: max_so_far and current_streak. The choice
          here is deliberate — UX shows "your active streak."
```

```
  src/lib/game/week-progress.ts (lines 62-64)

  export function completedCount(week: WeekProgress): number {
    return CATEGORIES.filter(c => week.sessionsCompleted[c]).length
  }
       │
       └─ CATEGORIES is `['push', 'pull', 'squat']` — n=3 forever.
          O(n) is meaningless; this is "literally three lookups."
          The `.filter().length` idiom is more readable than a manual
          counter; at n=3 the allocation cost is invisible.
```

### Where binary search WOULD attach if `contrl` grew

```
  Hypothetical placement map

  ┌─ feature ──────────────────────┬─ algorithm ─┬─ placement ──────────────┐
  │ find session by date           │ binary      │ src/lib/game/sessions.ts │
  │   in sorted list (n > 1000)    │   search    │   (if n ever justified)  │
  ├────────────────────────────────┼─────────────┼──────────────────────────┤
  │ "next gate level"              │ binary      │ not yet needed (levels   │
  │   in sorted level array        │   search    │   are 1-10, linear works)│
  ├────────────────────────────────┼─────────────┼──────────────────────────┤
  │ percentile of workout quality  │ quickselect │ src/lib/analytics/       │
  │                                │             │   stats.ts (new)         │
  └────────────────────────────────┴─────────────┴──────────────────────────┘
```

## Elaborate

**Timsort history and why it's the default.** Tim Peters wrote it for Python in 2002. JS engines adopted it for `Array.prototype.sort` around 2018 (V8 switched from quicksort). It exploits "natural runs" — sequences in the input that are already sorted — by merging them with O(n) detection. Real-world data is rarely random; Timsort is O(n) on common-case inputs.

**Stable vs unstable sorts.** A stable sort preserves the relative order of equal-keyed elements. Critical when you sort by multiple keys (sort by category, then by date — only works if the second sort is stable). Mergesort, Timsort, insertion sort are stable. Quicksort, heapsort are not.

**External sorting.** When your data is larger than RAM, you can't sort in-place. External merge sort: chunk into RAM-sized blocks, sort each, write back, then k-way merge. Used in databases for ORDER BY on huge result sets.

**Why binary search isn't free.** Even on a sorted array, binary search has worse cache behavior than linear scan for small n. The break-even is around n=64-256 depending on the hardware. Below that, linear search is faster because it's sequential and prefetches well. Above, binary search dominates.

**Search by hash vs binary search.** Hash O(1) > binary O(log n) for *one-shot* lookups when you have the exact key. Binary search wins when you need *range queries* ("all sessions between date X and Y") because the array is in order; hash maps can't answer range queries at all.

**Cross-link:** Heaps for priority queues live in `03-stacks-queues-deques-and-heaps.md`. B-tree (the disk-aware binary search) lives in `04-trees-tries-and-balanced-indexes.md` and `study-database-systems/`. Cost models for these operations live in `01-complexity-and-cost-models.md`.

## Interview defense

**Q: Explain why `Array.prototype.sort` is O(n log n) instead of O(n²).**

```
  Anchor diagram

  Timsort = merge sort with insertion-sort fallback for small runs
                 + natural-run detection for partial ordering

  worst case:  O(n log n)
  best case:   O(n)         ← already sorted
  stable:      yes
```

**Answer:** It's Timsort, a hybrid of mergesort and insertion sort optimized for the partial ordering that real-world data has. Worst case O(n log n) (mergesort's bound), best case O(n) when the input is already sorted or has long sorted runs. Stable, which matters for multi-key sorts. Insertion-sort is used for small partitions where the constant factors beat mergesort.

**Q: Walk me through binary search and the off-by-one trap.**

Anchor: the canonical binary-search pseudocode. **Answer:** Compute mid, compare, narrow the range. The trap is the boundary condition: do you use `<` or `≤` for the loop, and do you set `hi = mid` or `hi = mid - 1` when narrowing? The canonical form is inclusive `hi`, `lo ≤ hi`, and `hi = mid - 1`. The two have to be consistent — mismatch and you either loop forever or miss the target. Memorize one form and stick to it.

**Q: When would you reach for quickselect over a full sort?**

Anchor: the selection diagram. **Answer:** When you only need the k-th smallest, not the full order. Quickselect is O(n) average vs. sort's O(n log n). Useful for medians, percentiles, "top score in a leaderboard." If you need the *top K* (not just the k-th), heap-of-k is O(n log k) and uses bounded memory — better for streaming data where n could be unbounded.

**Q: Walk me through `reconstruct.ts:17-19`. Why sort before folding?**

Anchor: the sorted-fold diagram in Use cases. **Answer:** The fold counts *consecutive* clean sessions per gate. Consecutiveness is defined in time. If we folded an unsorted array, two clean sessions separated by a dirty one might appear consecutive in array order. Sorting by date makes "array order" equal "time order" so the fold can be naive. Cost: O(n log n), invisible at our n.

## Validate

1. **Reconstruct.** Without re-reading: name the worst-case complexity of quicksort, mergesort, and heapsort, and which is stable. *(Quick: O(n²) worst, unstable. Merge: O(n log n) worst, stable. Heap: O(n log n) worst, unstable.)*
2. **Explain.** Why does `reconstructFromSessions` (`reconstruct.ts:17-19`) sort by date before iterating? *(Gate progress counts *consecutive* clean sessions; consecutiveness is defined by time order. Sorting once lets the fold be naive.)*
3. **Apply.** A new screen shows "top 5 longest workouts." How would you compute it? *(Heap-of-5: walk the sessions array, push (duration, session) onto a max-heap, keep size ≤ 5 by popping when over. O(n log 5) = O(n). Or `.sort().slice(0, 5)` at O(n log n) — at our n, the difference is invisible, use the readable one.)*
4. **Defend.** A teammate adds binary search to `calculateStreak` to "make it O(log n)." Defend or reject. *(Reject. Binary search doesn't apply — streak calculation requires examining each week in order; you can't skip weeks. The current O(n) is optimal for this problem. The teammate confused "lookup in sorted data" with "this operation could be faster.")*

## See also

- `01-complexity-and-cost-models.md` — the O(n log n) lower bound for comparison sorts.
- `02-arrays-strings-and-hash-maps.md` — hash lookups as an alternative to "sort then binary search."
- `03-stacks-queues-deques-and-heaps.md` — heapsort, top-K with heap-of-k.
- `04-trees-tries-and-balanced-indexes.md` — B-tree as the disk-resident "sorted array."
- `study-database-systems/` — SQLite's index-driven WHERE-clause execution.
