# 03 — Stacks, queues, deques, and heaps

**LIFO / FIFO / double-ended queues / priority queues / binary heaps** — Industry standard.

## Zoom out, then zoom in

These are the "ordering-discipline" containers. Same underlying array, four different rules for *which element you can take out next*. The interview signal here is fluency: when a problem says "the most recently added," you reach for a stack without thinking; when it says "the smallest so far," you reach for a heap.

```
  Zoom out — where ordered containers would live in contrl (mostly hypothetical)

  ┌─ UI layer ───────────────────────────────────────────────────┐
  │  React's component stack (implicit, runtime-managed)         │
  │  Undo history (not yet exercised) ← would be a stack         │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Service / state layer ───▼──────────────────────────────────┐
  │  ★ THIS CHAPTER (mostly NOT YET EXERCISED) ★                 │
  │  - sync queue (offline → cloud)    ← would be a FIFO         │
  │  - rep event buffer                ← would be a ring/deque   │
  │  - top-N exercises by frequency    ← would be a min-heap     │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Storage layer ───────────▼──────────────────────────────────┐
  │  no queue infrastructure yet                                 │
  └──────────────────────────────────────────────────────────────┘
```

**Honest framing: `contrl` does not exercise stacks, queues, deques, or heaps in user code.** The closest analog is the JS engine's own call stack, which is implicit. This chapter is pure curriculum with a placement note per container — where each *would* attach if the repo grew that feature.

## Structure pass

**Layers.**

- **Stack** — LIFO: last-in-first-out. Two ops: `push`, `pop`. Both O(1).
- **Queue** — FIFO: first-in-first-out. Two ops: `enqueue` (tail), `dequeue` (head). Both O(1) with the right backing structure.
- **Deque** — double-ended queue. Push and pop at *both* ends. Both O(1).
- **Heap** — partial order: the "min" (or "max") is always at the root. `insert` and `extract-min` are O(log n).
- **Priority queue** — the abstract data type; heap is the standard implementation.

**Axis traced — order-of-removal (which item comes out next?).**

```
  axis = "which element does the container hand you?"

  stack:   the most-recently-pushed   → LIFO
  queue:   the longest-waiting         → FIFO
  deque:   either end, your choice     → both
  heap:    the smallest (or largest)   → priority

  same internal array; different rules for "next"
```

**Seams.** The boundary that flips the axis-answer is **the removal rule**. A stack and a queue can both be backed by the same array; what makes them different is "do you pop from the same end you pushed, or the other end?" That single rule is the entire abstraction.

## How it works

### Move 1 — the mental model

A stack is a tower of plates: you can only touch the top. A queue is a checkout line: first to arrive is first served. A deque is a deck of cards: you can deal from either end. A heap is a tournament bracket: the winner (smallest) bubbles to the top.

```
  Pattern — the four removal rules

  Stack (LIFO)              Queue (FIFO)
    push ────►┐                  enqueue ────►┐
              │   pop                          │
              ▼ ◄────                          │
            [ d ]                              ▼
            [ c ]                            [ a ][ b ][ c ][ d ]
            [ b ]                              ▲
            [ a ]                              │   dequeue ◄────
            (top)                            (head)        (tail)

  Deque (both ends)         Heap (priority)
                                          (smallest at root)
    pushFront ◄──[ a ][ b ][ c ][ d ]──► pushBack         [ 1 ]
    popFront  ◄──                  ──► popBack          /    \
                                                    [ 3 ]    [ 2 ]
                                                    /  \     /
                                                  [ 7 ][ 5 ][ 4 ]
```

The key insight on heaps: it's a *tree* but stored in an *array*. Child indices are `2i+1` and `2i+2`; parent index is `(i-1)/2`. No pointers, just arithmetic.

### Move 2 — the moves you'll make

#### Stack — push and pop

```
  Pseudocode — stack on an array

  class Stack:
    items = []

    push(x):                          // O(1)
      items.append(x)                 // append to tail

    pop():                            // O(1)
      if items is empty:
        return null
      return items.removeLast()       // remove from tail

    peek():                           // O(1)
      return items[len(items) - 1]
```

Backed by a JS array, `push` and `pop` are amortized O(1). The "tail of the array" is the stack top — push appends, pop truncates. Both ends are the same end.

Where you'd reach for it in `contrl`: an undo history (push every state change, pop to revert). Not yet exercised.

#### Queue — enqueue and dequeue

The naive queue (enqueue at tail, dequeue at head) using a plain array has an O(n) dequeue, because `array.shift()` shifts every remaining element.

```
  Pattern — the array-shift trap

  Enqueue: arr.push(x)       ← O(1) ✓
  Dequeue: arr.shift()       ← O(n) ✗  every element slides one slot left

  Two production-grade fixes:
   1. Linked list (head and tail pointers)        — O(1) both ends, but cache-bad
   2. Circular buffer (ring buffer)                — O(1) both ends, cache-good
```

```
  Pseudocode — circular buffer (the production queue)

  class Queue:
    buffer = array of size N
    head = 0                          // next dequeue position
    tail = 0                          // next enqueue position
    size = 0

    enqueue(x):                       // O(1)
      if size == N: resize()          // grow if full
      buffer[tail] = x
      tail = (tail + 1) mod N         // wrap around
      size += 1

    dequeue():                        // O(1)
      if size == 0: return null
      x = buffer[head]
      head = (head + 1) mod N         // wrap around
      size -= 1
      return x
```

The wrap-around `mod N` is the trick. Indices loop around the buffer; head and tail chase each other.

Where you'd reach for it in `contrl`: an offline sync queue (pending operations to push to a cloud when network returns). Not yet exercised — `contrl` is offline-only.

#### Deque — both ends

```
  Pseudocode — deque

  class Deque:
    // same circular buffer as Queue, plus:

    pushFront(x):                     // O(1)
      head = (head - 1 + N) mod N
      buffer[head] = x
      size += 1

    popBack():                        // O(1)
      tail = (tail - 1 + N) mod N
      return buffer[tail]
```

Same buffer, two more operations.

Where you'd reach for it in `contrl`: a fixed-size rep-event buffer (keep the last 30 angles for windowed analysis; old ones fall off the back). Not yet exercised — the EMA smoothing in `angles.ts` does similar work with a single scalar instead of a buffer.

#### Heap — the priority queue

This is the heavy one. A heap is a *binary tree stored in an array* with the **heap property**: every parent ≤ its children (min-heap) or every parent ≥ its children (max-heap).

```
  Pattern — heap shape (min-heap)

  array:     [ 1 ][ 3 ][ 2 ][ 7 ][ 5 ][ 4 ][ 9 ]
  indices:     0    1    2    3    4    5    6

  as a tree:
                   [ 1 ]                    (index 0)
                  /     \
              [ 3 ]    [ 2 ]               (indices 1, 2)
              /  \     /
           [ 7 ][ 5 ][ 4 ][ 9 ]            (indices 3, 4, 5, 6)

  invariants:
    parent(i) ≤ children(i)
    children(i) = 2i+1, 2i+2
    parent(i) = (i - 1) / 2          (integer division)
```

The array storage is what makes it fast: no pointers, no allocations per node, cache-friendly.

```
  Pseudocode — heap insert ("heapify up")

  insert(x):                                    // O(log n)
    items.append(x)                             // place at end of array
    i = len(items) - 1                          // new index
    while i > 0:                                // bubble up while heap broken
      parent = (i - 1) / 2
      if items[i] < items[parent]:              // min-heap: swap if smaller
        swap(items[i], items[parent])
        i = parent
      else:
        break                                   // heap property restored

  Pseudocode — extract-min ("heapify down")

  extractMin():                                 // O(log n)
    min = items[0]                              // root is always the min
    items[0] = items.removeLast()               // move last to root
    i = 0
    while true:
      left = 2i + 1
      right = 2i + 2
      smallest = i
      if left < len and items[left] < items[smallest]: smallest = left
      if right < len and items[right] < items[smallest]: smallest = right
      if smallest == i: break                   // heap restored
      swap(items[i], items[smallest])
      i = smallest
    return min
```

```
  Execution trace — insert(0) into the heap above

  initial:     [1, 3, 2, 7, 5, 4, 9]
  step 1:      append 0   → [1, 3, 2, 7, 5, 4, 9, 0]   i=7, parent=3 (val 7)
  step 2:      0 < 7, swap → [1, 3, 2, 0, 5, 4, 9, 7]  i=3, parent=1 (val 3)
  step 3:      0 < 3, swap → [1, 0, 2, 3, 5, 4, 9, 7]  i=1, parent=0 (val 1)
  step 4:      0 < 1, swap → [0, 1, 2, 3, 5, 4, 9, 7]  i=0, stop (at root)

  final:       [0, 1, 2, 3, 5, 4, 9, 7]   ✓ heap property restored
```

Where you'd reach for it in `contrl`: "show the user their top-5 most-frequent exercises." Not yet exercised. You'd push (count, exercise) pairs onto a max-heap and pop 5 times. For n exercises and k=5 output, that's O(n + k log n) — beats sort's O(n log n) when k ≪ n.

#### Priority queue — the abstract data type

Priority queue is the *interface*; heap is the *implementation*. Other implementations exist (Fibonacci heaps, pairing heaps) but the binary heap is the standard answer in interviews.

```
  Pattern — when you reach for a priority queue

  - Dijkstra / A*               (next-shortest-path-so-far)
  - top-K problems              (smallest k from a stream)
  - event simulation            (next-event-by-timestamp)
  - process scheduling          (highest-priority-task)
  - rate limiting               (next-token-bucket-expiry)
```

### Move 3 — the principle

**The container is determined by the question "which one comes out next?"** Not by what you store. The same `WorkoutSession[]` can be wrapped as a stack ("most recent"), a queue ("oldest pending"), or fed into a heap ("longest workout"). Pick the wrapper by the *removal rule* your code needs.

## Primary diagram

```
  The full picture — four ordering disciplines

  ┌─ Stack ──────────────────────────────────────────────────────┐
  │   LIFO · O(1) push/pop · backed by array (tail = top)        │
  │   undo, function calls, parser parens, DFS-iterative         │
  └──────────────────────────────────────────────────────────────┘
  ┌─ Queue ──────────────────────────────────────────────────────┐
  │   FIFO · O(1) enq/deq · backed by circular buffer            │
  │   task queues, sync queues, BFS frontier, rate limiting      │
  └──────────────────────────────────────────────────────────────┘
  ┌─ Deque ──────────────────────────────────────────────────────┐
  │   both ends · O(1) all four ops · sliding window, fixed buf  │
  └──────────────────────────────────────────────────────────────┘
  ┌─ Heap / priority queue ──────────────────────────────────────┐
  │   smallest-out · O(log n) insert / extract                   │
  │   array-backed binary tree; child=2i+1,2i+2; parent=(i-1)/2  │
  │   Dijkstra, top-K, event simulation, scheduling              │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### Use cases

**Not yet exercised in `contrl`.** No explicit stacks, queues, deques, or heaps in user code.

There are two implicit / adjacent cases worth naming:

- **The JS call stack** — every function call pushes a frame; every return pops one. Visible in stack traces. Limit is around 10K frames in V8. Cross-link: `study-runtime-systems/`.
- **The React component tree's render order** — implicit stack during reconciliation; not something you reach for directly.

### Where each WOULD attach if `contrl` grew

```
  Hypothetical placement map

  ┌─ feature ────────────┬─ container ──┬─ placement ────────────────┐
  │ undo last set        │ stack         │ src/lib/game/history.ts    │
  │   (pop to revert)    │               │   (new file)               │
  ├──────────────────────┼───────────────┼────────────────────────────┤
  │ offline sync queue   │ FIFO queue    │ src/lib/sync/queue.ts      │
  │   (push when offline,│               │   (new file)               │
  │    pop when online)  │               │                            │
  ├──────────────────────┼───────────────┼────────────────────────────┤
  │ 30-frame angle       │ deque         │ src/lib/pose/window.ts     │
  │   smoothing window   │ (ring buffer) │   (replaces single-scalar  │
  │                      │               │    EMA in angles.ts:21-23) │
  ├──────────────────────┼───────────────┼────────────────────────────┤
  │ top-5 exercises      │ max-heap      │ src/lib/game/stats.ts      │
  │   by frequency       │               │   (new file)               │
  └──────────────────────┴───────────────┴────────────────────────────┘
```

### Code side by side

No real code in this repo to annotate. The cross-link for "what you implemented elsewhere" is your `BinaryHeap.ts` and `PriorityQueue.ts` in `reincodes` (per `me.md`). The interview move is to anchor to those: "I implemented MinHeap and MaxHeap from scratch with heapifyUp / heapifyDown — same array-as-tree representation I described above."

## Elaborate

**Heaps were invented for heapsort** (J.W.J. Williams, 1964) — the in-place sort that uses a max-heap. Later Robert Tarjan and others found priority-queue applications. The Fibonacci heap (1984) improved Dijkstra's amortized complexity but is rarely used in practice because constants are bad.

**Why binary heaps win in practice:**

- Array layout is cache-friendly (a tree of pointers would scatter across memory).
- No allocations per insert (the array grows in big chunks like any dynamic array).
- The arithmetic is trivial (one multiply, one shift, one add for parent/child indices).

**The k-th smallest problem.** For "find the k-th smallest in n items," a heap-of-size-k beats sorting:

- Sort: O(n log n)
- Heap-of-k: O(n log k) — push first k, then for each remaining: if smaller than heap max, replace and sift

When n ≫ k, heap-of-k wins. This is the standard "top-K from a stream" pattern.

**Indexed priority queue** — a heap with a hash map alongside that maps `value → index`. Lets you `decreaseKey(value, newPriority)` in O(log n). Dijkstra needs this; a plain heap doesn't support it. Your `PriorityQueue.ts` in `reincodes` (per `me.md`) has this — value→index lookup for Dijkstra's relax step.

**Cross-link:** Graph algorithms that use heaps (Dijkstra, A*, Prim's MST) live in `05-graphs-and-traversals.md`. The runtime stack (call stack, recursion limits) lives in `study-runtime-systems/`.

## Interview defense

**Q: Implement a queue with two stacks.**

```
  Anchor diagram

  enqueue(x): push to stack_in
  dequeue():  if stack_out empty,
               pop all from stack_in into stack_out (reverses order)
              pop from stack_out

   stack_in (push side)        stack_out (pop side)
     [ d ]                         [ a ]
     [ c ]      ───transfer──►     [ b ]    ← popped first
     [ b ]                         [ c ]
     [ a ]                         [ d ]
```

**Answer:** Two stacks, push on `stack_in`, pop on `stack_out`. When `stack_out` is empty, dump all of `stack_in` into it (reverses order, so what was bottom-of-in becomes top-of-out, which is FIFO). Amortized O(1) per op because each element moves between stacks at most twice.

**Q: Why is a binary heap stored in an array instead of a tree of nodes?**

Anchor: the heap layout diagram. **Answer:** Three reasons. (1) Cache locality — siblings are adjacent in memory. (2) No per-node allocation — heap grows in big array chunks instead of n small mallocs. (3) Index arithmetic is trivial — parent and children are `(i-1)/2`, `2i+1`, `2i+2`, no pointer chasing. The array layout is *why* heaps are the standard priority-queue implementation despite Fibonacci heaps having better asymptotic complexity.

**Q: When would you use a deque over a queue?**

Anchor: the deque diagram. **Answer:** Sliding-window problems (push to the back, pop from the front to maintain a fixed window size) and any algorithm that needs to push back what it just popped (BFS with backtracking). Whenever the access pattern isn't purely one-ended.

## Validate

1. **Reconstruct.** Without re-reading: explain the heap-array index formulas. *(parent = `(i-1)/2`, children = `2i+1` and `2i+2`.)*
2. **Explain.** Why is `array.shift()` O(n) but `array.pop()` O(1)? *(Shift removes from the head and slides every remaining element left by one; pop truncates the tail and moves nothing.)*
3. **Apply.** Design a system that keeps the last 30 rep angles for `contrl`'s pose pipeline. Which container? *(Fixed-size ring buffer / deque: push to back, pop from front when full. O(1) per frame, bounded memory.)*
4. **Defend.** A teammate wants to "add an offline sync queue using `array.push` and `array.shift`." What's the issue? *(`shift` is O(n); at high enqueue rate the queue becomes a bottleneck. Use a circular buffer or two-stack queue. At low rates n is small enough that it doesn't matter — name the threshold, don't over-engineer.)*

## See also

- `02-arrays-strings-and-hash-maps.md` — the underlying array these all live on.
- `04-trees-tries-and-balanced-indexes.md` — heaps are a kind of tree (array-stored).
- `05-graphs-and-traversals.md` — BFS uses a queue, DFS uses a stack, Dijkstra uses a heap.
- `study-runtime-systems/` — the JS call stack, recursion limits.
