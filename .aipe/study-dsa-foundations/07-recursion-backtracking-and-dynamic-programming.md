# 07 — Recursion, backtracking, and dynamic programming

**Recursion / divide and conquer / backtracking / memoization / tabulation** — Industry standard.

## Zoom out, then zoom in

These three are siblings. Recursion is the syntactic mechanism (a function calling itself). Backtracking is recursion applied to search problems with pruning. DP is recursion plus memoization to avoid recomputing overlapping subproblems. Once you see them as variations on the same theme, the interview category "DP problems" stops feeling magical.

```
  Zoom out — where these patterns would live in contrl

  ┌─ UI / state layer ───────────────────────────────────────────┐
  │  React render is recursive over the component tree           │
  │   (framework-managed; not your recursion)                    │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Game / domain layer ─────▼──────────────────────────────────┐
  │  ★ THIS CHAPTER — ONE EXAMPLE (the fold) ★                   │
  │  reconstructFromSessions is a reduce/fold — the iterative    │
  │   relative of recursion. No explicit recursion in user code. │
  │  No backtracking. No DP.                                     │
  └──────────────────────────────────────────────────────────────┘
```

**Honest framing: `contrl` has zero explicit recursion in user code, zero backtracking, zero DP.** The closest analog is the iterative fold in `reconstructFromSessions` — semantically a left-fold (which is what `reduce` is, which is the iterative dual of right-recursion). This chapter teaches the curriculum with one repo anchor (the fold) and pure-curriculum sections for backtracking and DP.

## Structure pass

**Layers.**

- **Recursion (mechanism)** — a function calls itself with smaller input. Base case + recursive case.
- **Divide and conquer** — split into independent subproblems, solve each, combine. Mergesort, quicksort, FFT.
- **Backtracking** — recursive search over a state space with pruning. Sudoku, n-queens, permutations.
- **Dynamic programming** — recursion + memoization. Overlapping subproblems + optimal substructure.
- **Fold / reduce (iterative dual)** — recursion expressed as a loop over an accumulator.

**Axis traced — overlap (do subproblems repeat?).**

```
  axis = "do the recursive subproblems overlap?"

  pure recursion:      subproblems independent  → just recurse
  divide and conquer:  independent              → split-solve-combine
  backtracking:        independent + pruning    → explore, undo on fail
  dynamic programming: overlapping              → memoize subproblem results
  fold (iterative):    sequential, accumulated  → no recursion at all
```

**Seams.** The boundary that flips the axis-answer is **whether subproblems overlap**. If they don't, recursion or D&C is fine. If they do, naive recursion is exponential and you *must* memoize — that's the DP seam. Spotting overlap is the hard part; once you see it, applying DP is mechanical.

## How it works

### Move 1 — the mental model

A recursive function expresses "the answer to this problem in terms of the answer to a smaller version of itself." Two parts that are non-negotiable:

```
  Pattern — the recursion kernel

  function solve(input):
    if isBaseCase(input):                  ← without this: infinite recursion
      return baseAnswer
    smaller = makeSmaller(input)           ← without this: input never shrinks
    return combine(solve(smaller))         ← the recursive call

  // Drop the base case  → stack overflow
  // Drop makeSmaller    → infinite recursion (same input each call)
  // Drop combine        → you just have a loop wearing a hat
```

The "smaller version" is the key word. If each call works on the same-size input, you're not recursing, you're spinning.

### Move 2 — the moves you'll make

#### Recursion — the canonical example

```
  Pseudocode — factorial

  function factorial(n):
    if n ≤ 1:                              ← base case
      return 1
    return n * factorial(n - 1)            ← recursive case
```

```
  Execution trace — factorial(4)

  factorial(4)
   ├─ factorial(3)
   │   ├─ factorial(2)
   │   │   ├─ factorial(1) → 1
   │   │   └─ returns 2 * 1 = 2
   │   └─ returns 3 * 2 = 6
   └─ returns 4 * 6 = 24

  → 24
```

Each call adds a stack frame. n=4 → 4 frames. n=10000 → blows the JS call stack in most engines (limit around 10K frames). For deep recursion, use iteration or trampolines.

**Cross-link:** Call stack mechanics and recursion limits live in `study-runtime-systems/`.

#### Divide and conquer

```
  Pattern — divide and conquer

  function solve(input):
    if input small enough: solve directly
    split into independent subproblems
    solve(each subproblem)
    combine the results

  Examples:
   - mergesort (split list in half, sort each, merge)
   - quicksort (partition, sort each side)
   - binary search (halve the range)
   - FFT (split into even/odd indices)
```

The "independent" qualifier is what makes D&C different from DP. Mergesort's left and right halves don't share subproblems — each element appears in exactly one recursive call.

#### Backtracking

Recursive search with pruning. At each step: try a choice, recurse, if it fails undo the choice and try the next.

```
  Pseudocode — backtracking template

  function backtrack(partial, choices):
    if isComplete(partial):
      record(partial)
      return
    for each choice in choices:
      if isValid(partial + choice):
        partial.add(choice)              ← make the choice
        backtrack(partial, choices)      ← explore
        partial.remove(choice)           ← UNDO ← this is "backtrack"
```

```
  Pattern — permutations of [1, 2, 3]

  []
   ├─ 1, ...
   │   ├─ 1, 2, ...
   │   │   └─ 1, 2, 3        ← complete
   │   └─ 1, 3, ...
   │       └─ 1, 3, 2        ← complete
   ├─ 2, ...
   │   ├─ 2, 1, 3
   │   └─ 2, 3, 1
   └─ 3, ...
       ├─ 3, 1, 2
       └─ 3, 2, 1

  6 permutations explored; the tree is the recursion.
```

Pruning is what saves you. Without pruning, n-queens explores 8⁸ = 16M positions; with pruning (check row/diag conflicts as you place), it's ~2K.

Where you'd reach for it: "find all workout plans that include exactly one of each category over the next week." Not yet exercised in `contrl`.

#### Dynamic programming

When subproblems overlap, naive recursion recomputes the same subproblem exponentially many times. Memoization caches each subproblem's answer.

```
  Pattern — Fibonacci, naive vs memoized

  naive recursion:
    fib(5)
     ├─ fib(4)                     5 calls to fib(0)
     │   ├─ fib(3)                 3 calls to fib(1)
     │   │   ├─ fib(2)             every value computed many times
     │   │   │   ├─ fib(1) → 1
     │   │   │   └─ fib(0) → 0
     │   │   └─ fib(1) → 1
     │   └─ fib(2)
     │       ├─ fib(1) → 1
     │       └─ fib(0) → 0
     └─ fib(3)
         ├─ fib(2) [recomputed]
         └─ fib(1) → 1

  Naive: O(2ⁿ) calls.
  With memoization: each fib(k) computed once. O(n) calls.
```

```
  Pseudocode — Fibonacci with memoization (top-down DP)

  cache = {}
  function fib(n):
    if n in cache: return cache[n]
    if n ≤ 1: return n
    result = fib(n - 1) + fib(n - 2)
    cache[n] = result
    return result

  // O(n) time, O(n) space.

  Pseudocode — Fibonacci with tabulation (bottom-up DP)

  function fib(n):
    if n ≤ 1: return n
    table = [0, 1]
    for i from 2 to n:
      table[i] = table[i-1] + table[i-2]
    return table[n]

  // O(n) time. Can be O(1) space — only keep last two.
```

Two flavors of DP:

- **Top-down (memoization)** — recursive, cache results. Easier to write from a recursive formulation.
- **Bottom-up (tabulation)** — iterative, fill a table from smallest subproblem up. Avoids recursion overhead, often more space-efficient.

#### The DP recipe

Standard interview move:

1. **Define the state.** What's the smallest set of variables that determines a subproblem's answer? (For Fibonacci: just `n`.)
2. **Write the recurrence.** Express `state` in terms of smaller states. (`fib(n) = fib(n-1) + fib(n-2)`.)
3. **Pick the order.** Top-down (memoize) or bottom-up (tabulate).
4. **Identify base cases.** The smallest states with known answers.
5. **Compute the final answer.** Often just `dp[n]`, sometimes max/min over a row.

```
  Pattern — longest common subsequence (LCS)

  state:   (i, j) = lengths of prefixes of strings a and b
  recur:   if a[i] == b[j]: lcs(i, j) = 1 + lcs(i-1, j-1)
           else:             lcs(i, j) = max(lcs(i-1, j), lcs(i, j-1))
  base:    lcs(0, j) = lcs(i, 0) = 0
  order:   bottom-up fills a 2D table; cell (i,j) depends on (i-1,j-1),
           (i-1,j), (i,j-1) — all to the upper-left.

  O(n × m) time and space.
```

#### Fold / reduce — recursion as iteration

A right-fold IS recursion-over-list. A left-fold IS iterative-with-accumulator. They're duals.

```
  Pseudocode — sum as fold

  // recursive (right-fold)
  function sum(list):
    if list is empty: return 0
    return list.head + sum(list.tail)

  // iterative (left-fold / reduce)
  function sum(list):
    acc = 0
    for each x in list:
      acc = acc + x
    return acc

  // Same answer. Recursive version uses O(n) stack;
  // iterative uses O(1) stack.
```

This is the pattern `contrl` actually uses. `reconstructFromSessions` is a left-fold over sorted sessions, accumulating game state.

### Move 3 — the principle

**Recursion expresses problems in terms of smaller versions of themselves. DP applies recursion to problems where the smaller versions repeat.** The job is to spot which world you're in: independent subproblems (recurse or D&C), overlapping subproblems (DP), or sequential with state (fold). Misidentifying the world is the source of every "this is too slow" interview moment.

## Primary diagram

```
  The full picture — recursion family tree

                       recursion (the mechanism)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  independent          overlapping          sequential
  subproblems          subproblems          (no overlap,
        │                     │              no branching)
        ▼                     ▼                     ▼
   ┌────────────┐      ┌─────────────┐      ┌──────────────┐
   │  divide &  │      │   dynamic   │      │   fold /     │
   │   conquer  │      │ programming │      │   reduce     │
   └────────────┘      └─────────────┘      └──────────────┘
        │                     │
        │                     ▼
        │              memoize → top-down
        │              tabulate → bottom-up
        │
        ▼
   ┌────────────┐
   │ backtrack  │  ← D&C with pruning + undo
   │  (search   │
   │   space)   │
   └────────────┘
```

## Implementation in codebase

### Use cases

- **The fold-as-reconstruction.** `reconstructFromSessions` (`src/lib/game/reconstruct.ts:32-61`) walks sorted sessions left-to-right, accumulating gate progress and user levels. It's a left-fold with two parallel accumulators (`userLevels` and `gates`). Semantically equivalent to a recursive `reduce`, but written as a `for...of` loop because JS doesn't optimize tail calls.
- **No explicit recursion in user code.** Search the repo: no function calls itself. React renders recursively under the hood; that's the framework, not your code.
- **No backtracking, no DP.** The problems `contrl` solves don't have overlapping subproblems or combinatorial search spaces.

### Code side by side

```
  src/lib/game/reconstruct.ts (lines 32-61) — the fold

  for (const session of sorted) {                  ← left-fold over sorted input
    const { category, level } = session
    const currentLevel = userLevels[category]      ← read accumulator state

    if (level > currentLevel) continue             ← skip / "filter" inside fold
    const gate = getGate(category, level)
    if (gate.status === 'passed') continue         ← early-continue (pruning)

    const isClean = session.exercises.length > 0 &&
      session.exercises.every(e => e.hitTarget)

    if (isClean) {
      gate.consecutivePasses += 1                  ← state update on accumulator
      gate.lastSessionDate = session.date
      if (gate.consecutivePasses >= 3) {            ← state transition condition
        gate.status = 'passed'
        if (level === currentLevel && currentLevel < MAX_LEVEL) {
          userLevels[category] = currentLevel + 1
          getGate(category, currentLevel + 1)     ← initialize next gate
        }
      }
    } else {
      gate.consecutivePasses = 0                   ← reset on miss (state-machine-ish)
      gate.lastSessionDate = session.date
    }
  }
       │
       └─ this IS a fold, even though it's written as a for-loop. The
          accumulators are `userLevels` and `gates`; each iteration
          reads them, possibly updates them, and proceeds to the next
          session. There's NO recursion in this code — same problem,
          iterative dual.

          Why iterative instead of recursive? Three reasons:
          1. JS doesn't optimize tail calls (no TCO in V8). Recursion
             would consume stack proportional to sessions count.
          2. The two-accumulator shape (`userLevels` AND `gates`) is
             awkward in a pure-functional `reduce` call without
             tuples or destructuring gymnastics.
          3. The `continue` short-circuits (lines 38, 41) are clearer
             with early-continue than with a wrapped recursion.

          The recursive equivalent would be:
              reconstruct(sessions[], level, gates) =
                if sessions empty: return { level, gates }
                let [s, ...rest] = sessions
                let (level', gates') = applyToSession(s, level, gates)
                return reconstruct(rest, level', gates')
          — same logic, blown stack on 10K sessions.
```

### Where each pattern WOULD attach if exercised

```
  Hypothetical placement map

  ┌─ feature ──────────────────────┬─ pattern ────────┬─ placement ────────┐
  │ generate weekly workout plan   │ backtracking     │ src/lib/game/       │
  │   (1 push + 1 pull + 1 squat,  │   over plan      │   planner.ts (new) │
  │    pruning conflicts)          │   combos         │                    │
  ├────────────────────────────────┼──────────────────┼────────────────────┤
  │ "longest streak of consecutive │ DP / dual ptr    │ src/lib/game/       │
  │  clean weeks"                  │                  │   streak-stats.ts   │
  ├────────────────────────────────┼──────────────────┼────────────────────┤
  │ depth-first walk of an         │ recursion        │ already in React,  │
  │  exercise prerequisite tree    │                  │   not your code    │
  └────────────────────────────────┴──────────────────┴────────────────────┘
```

## Elaborate

**Tail call optimization (TCO).** A "tail call" is a recursive call that's the *last thing* the function does. TCO rewrites it into a loop — no new stack frame. Scheme, Scala, OCaml, Erlang have TCO. **JavaScript does not** (the spec mandates it, but no engine implements it). This is why deep recursion crashes in JS but works fine in Scheme.

**Mutual recursion** — two functions calling each other. Useful for parsers (an expression is a term followed by an operator followed by an expression). Same stack problem as direct recursion.

**Why DP problems "look like" recursion problems.** Because they ARE recursion problems — DP is the special case where the recursion tree has overlapping subtrees. Every DP problem can be written as a recursion with memoization (top-down) or as iteration filling a table (bottom-up). The two views interconvert mechanically.

**The hard part of DP is identifying the state.** Once you know the state, the recurrence usually writes itself. The interview move is to start with the recursion formulation, identify what subproblem each call corresponds to, and notice when two calls have the same arguments (overlap).

**Common DP families.**

- **Linear DP** (1D state): Fibonacci, climbing stairs, house robber.
- **2D DP**: LCS, edit distance, grid paths.
- **Knapsack family**: 0/1 knapsack, unbounded knapsack, coin change.
- **Interval DP**: matrix chain multiplication, optimal BST.
- **Bitmask DP**: TSP on small n, subset sums.
- **DP on trees**: tree diameter, subtree sums.

**Cross-link:** Call stack limits and TCO live in `study-runtime-systems/`. Graph algorithms (which often use recursive DFS) live in `05-graphs-and-traversals.md`. The complexity analysis of recursive algorithms (Master Theorem, recurrence relations) extends `01-complexity-and-cost-models.md`.

## Interview defense

**Q: Walk me through the difference between divide-and-conquer and dynamic programming.**

```
  Anchor diagram

  Divide & Conquer:                   Dynamic Programming:
       solve(n)                            solve(n)
        / \                                 / \
   solve(a) solve(b)                  solve(n-1) solve(n-2)
   (independent;                       (overlap; both subtrees
    no overlap)                         compute solve(n-3), etc.)

  → recurse                            → recurse + memoize
```

**Answer:** Both split into subproblems and recurse. D&C subproblems are independent (mergesort's left half doesn't touch the right). DP subproblems overlap (Fibonacci recomputes the same values). The flag for DP is "I see the same subproblem twice in the recursion tree." Memoize, and exponential becomes linear or polynomial.

**Q: Show me how `reconstructFromSessions` is a fold and why it's not written recursively.**

Anchor: the for-loop with two accumulators diagram. **Answer:** It walks sorted sessions left-to-right, updating two accumulators — `userLevels` and `gates`. That's structurally a left-fold: `reduce((acc, session) => applyToSession(acc, session), initialAcc, sessions)`. Written as a for-loop instead of `.reduce()` for three reasons: JS doesn't TCO so recursion would blow the stack on long histories; two parallel accumulators are awkward in a pure `reduce`; the early-`continue`s are clearer in a for loop than in chained returns.

**Q: When does memoization buy you nothing?**

Anchor: the D&C-vs-DP tree diagram. **Answer:** When subproblems don't overlap. Mergesort's left and right halves are independent — memoizing would just waste memory storing answers you'll never look up again. The signal is "do I see the same arguments twice in the recursion tree?" Yes → memoize. No → just recurse.

**Q: Implement Fibonacci three ways and name the tradeoffs.**

Anchor: the three Fib implementations. **Answer:** Naive recursion: O(2ⁿ) — toy only. Memoized: O(n) time, O(n) space, easy to write from the recursion. Bottom-up with rolling pair: O(n) time, O(1) space, no recursion overhead. The bottom-up rolling pair is the answer to "compute Fib(n) optimally" — you only ever need the last two values.

## Validate

1. **Reconstruct.** Without re-reading: write the recursion kernel — what's load-bearing and what breaks if you drop each part? *(Base case prevents infinite recursion; makeSmaller prevents same-input loops; combine assembles subanswers. Drop any one and it breaks differently.)*
2. **Explain.** Why is `reconstructFromSessions` (`reconstruct.ts:32-61`) written as a for-loop rather than recursively? *(JS no TCO; long histories would blow stack. Two parallel accumulators awkward in `.reduce()`. Early-`continue` clearer iteratively.)*
3. **Apply.** "Find every 7-day workout plan with one push, one pull, one squat session and at most 3 rest days." Recursive or DP? *(Backtracking: build a plan day-by-day, prune when constraints violated, undo on dead-ends. The state space is small enough that pure backtracking works; if it weren't, you'd memoize by (current_day, push_done, pull_done, squat_done).)*
4. **Defend.** A teammate refactors `reconstructFromSessions` into a recursive `.reduce()`. Defend or reject. *(Reject for `contrl` at typical n (a few hundred sessions) — `reduce` is fine, no stack issue. Reject the *recursive* rewrite specifically — JS no TCO, stack-bounded. Accept the `.reduce()` rewrite if it's iterative-`reduce` with a single accumulator that holds both `userLevels` and `gates` as a tuple. Cost: more allocation per step. Net call: not worth the churn.)*

## See also

- `01-complexity-and-cost-models.md` — analyzing recursive algorithms (recurrence relations, Master Theorem).
- `04-trees-tries-and-balanced-indexes.md` — tree traversals are recursive.
- `05-graphs-and-traversals.md` — recursive DFS, backtracking over graphs.
- `06-sorting-searching-and-selection.md` — mergesort and quicksort as D&C examples.
- `study-runtime-systems/` — call stack limits, TCO, recursion in JS.
