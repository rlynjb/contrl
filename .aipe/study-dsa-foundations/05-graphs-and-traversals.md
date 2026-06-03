# 05 — Graphs and traversals

**Graphs / BFS / DFS / shortest paths / topological sort / union-find** — Industry standard.

## Zoom out, then zoom in

A graph is "nodes connected by edges." That's it. Everything else — directedness, weights, traversal, shortest paths — is layered on top of that primitive. Graph algorithms are the highest-leverage interview chapter because so many problems reduce to a graph once you see it: dependencies, routes, social networks, state machines, even your file system.

```
  Zoom out — where graphs would live in contrl (NOT YET EXERCISED)

  ┌─ UI / state layer ───────────────────────────────────────────┐
  │  The rep counter's state space is graph-shaped:              │
  │   idle ──► ready ──► down ──► bottom ──► up ──► ready (++)   │
  │   (but the implementation is a switch statement, not a graph)│
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Service / domain layer ──▼──────────────────────────────────┐
  │  ★ THIS CHAPTER — pure curriculum ★                          │
  │  - exercise progression graph (push-up → wide push → …)      │
  │  - workout dependency graph (must do A before B)             │
  │  - shortest-path through skill tree                          │
  │  None of these are coded.                                    │
  └──────────────────────────────────────────────────────────────┘
```

**Honest framing: `contrl` does not implement any graph algorithm.** The rep counter's *conceptual* state graph is the closest thing, and it's implemented as a switch statement, not a graph data structure. This chapter is pure curriculum. Your portfolio anchor (per `me.md`) is `reincodes/Graph.ts` and `Graph2.ts` — BFS, DFS, Dijkstra over an explicit graph. That's where the algorithms actually live for you.

## Structure pass

**Layers.**

- **The graph itself** — nodes (V), edges (E). May be directed, weighted, cyclic.
- **The representation** — adjacency list vs adjacency matrix. Determines space and ops.
- **The traversal** — BFS (queue, level-order) or DFS (stack/recursion, depth-first).
- **The algorithm on top of traversal** — shortest paths (Dijkstra, A*), topological sort, connected components, MST.

**Axis traced — exploration order (which node do you visit next?).**

```
  axis = "which unvisited neighbor do you process next?"

  BFS:        nearest first         → FIFO queue
  DFS:        deepest first         → stack (explicit or call-stack)
  Dijkstra:   cheapest-known first  → min-heap by accumulated cost
  A*:         cheapest+heuristic    → min-heap by (cost + estimated remaining)
  Topo sort:  no-pending-deps first → queue of zero-indegree nodes
```

**Seams.** The boundary that flips the axis-answer is **the container holding the frontier**. Swap the queue in BFS for a stack and it becomes DFS. Swap the queue for a min-heap and it becomes Dijkstra. The traversal logic is *identical*; the container determines the semantics.

## How it works

### Move 1 — the mental model

A graph is a set of nodes connected by edges. You explore it by maintaining a *frontier* — nodes you know about but haven't processed yet. You repeat: take one from the frontier, mark it visited, add its unvisited neighbors to the frontier. Done when the frontier is empty.

```
  Pattern — the universal graph traversal

  visited = {start}
  frontier = [start]                    // container varies by algorithm

  while frontier not empty:
    current = frontier.take()           // queue / stack / heap
    process(current)
    for each neighbor of current:
      if neighbor not in visited:
        visited.add(neighbor)
        frontier.put(neighbor)
```

Three load-bearing parts (the kernel):
- **frontier** — the to-visit container
- **visited set** — prevents infinite revisits on cycles
- **termination** — frontier empty means done

Drop the visited set → infinite loop on any cycle. Drop the termination check → walk forever. The frontier *container* picks the algorithm.

### Move 2 — the moves you'll make

#### Representing a graph

Two standard representations:

```
  Pattern — adjacency list vs adjacency matrix

  Graph:    A ── B
            │    │
            C ── D

  Adjacency list (good for sparse):
    A: [B, C]
    B: [A, D]
    C: [A, D]
    D: [B, C]
    space: O(V + E)
    "neighbors of X": O(deg(X))

  Adjacency matrix (good for dense, fast edge-query):
        A  B  C  D
    A [ 0  1  1  0 ]
    B [ 1  0  0  1 ]
    C [ 1  0  0  1 ]
    D [ 0  1  1  0 ]
    space: O(V²)
    "edge X-Y?": O(1)
```

For most real problems use adjacency list. Matrices win only when you have dense graphs (E ≈ V²) or need O(1) "is X connected to Y?" queries.

#### BFS — breadth-first search

Container: FIFO queue. Property: visits nodes in order of distance from start. Use for unweighted shortest path, level-order traversal, "is X reachable from Y."

```
  Pseudocode — BFS

  function bfs(graph, start):
    visited = { start }
    queue   = [ start ]
    distance = { start: 0 }
    parent   = { start: null }

    while queue not empty:
      current = queue.dequeue()                  // FIFO!
      for each neighbor in graph[current]:
        if neighbor not in visited:
          visited.add(neighbor)
          distance[neighbor] = distance[current] + 1
          parent[neighbor] = current
          queue.enqueue(neighbor)

    return distance, parent
```

```
  Execution trace — BFS from A

  graph:   A ── B ── E
           │    │
           C    D ── F

  step  queue           visited            current  enq'd     distance
  0     [A]             {A}                —        —         A:0
  1     [B, C]          {A,B,C}            A        B,C       B:1, C:1
  2     [C, E, D]       {A,B,C,D,E}        B        E,D       D:2, E:2
  3     [E, D]          {A,B,C,D,E}        C        —         (C had no new neighbors)
  4     [D]             {A,B,C,D,E}        E        —
  5     [F]             {A,B,C,D,E,F}      D        F         F:3
  6     []              ...                F        —
  done.

  shortest path A → F via parent map: F ← D ← B ← A
```

#### DFS — depth-first search

Container: stack (or recursion). Property: dives deep first. Use for cycle detection, topological sort, connected components, "any path X→Y," tree-shaped problems.

```
  Pseudocode — DFS (recursive)

  function dfs(graph, node, visited):
    visited.add(node)
    process(node)
    for each neighbor in graph[node]:
      if neighbor not in visited:
        dfs(graph, neighbor, visited)

  // Iterative DFS = same but with explicit stack:
  function dfsIterative(graph, start):
    visited = {}
    stack   = [ start ]
    while stack not empty:
      current = stack.pop()                  // LIFO!
      if current in visited: continue
      visited.add(current)
      process(current)
      for each neighbor in graph[current]:
        if neighbor not in visited:
          stack.push(neighbor)
```

Same skeleton as BFS, swap queue for stack. The output order is depth-first.

#### Dijkstra — shortest path with weights

When edges have non-negative weights, BFS doesn't work (it counts edges, not weight). Dijkstra fixes this: frontier is a *min-heap* by accumulated cost.

```
  Pseudocode — Dijkstra

  function dijkstra(graph, start):
    dist = { start: 0 }                      // best known distance
    heap = MinHeap()
    heap.insert(start, priority=0)

    while heap not empty:
      current = heap.extractMin()             // cheapest-known first
      for each (neighbor, weight) in graph[current]:
        newDist = dist[current] + weight
        if newDist < (dist[neighbor] ?? ∞):
          dist[neighbor] = newDist
          heap.insertOrUpdate(neighbor, priority=newDist)

    return dist
```

The "insertOrUpdate" is the indexed-priority-queue operation — needs a value-to-heap-index map. Your `PriorityQueue.ts` in `reincodes` (per `me.md`) has this.

```
  Execution trace — Dijkstra on a 4-node graph

  graph (directed, weighted):
    A --3--> B
    A --1--> C
    C --1--> B
    B --2--> D
    C --5--> D

  step  extracted  dist updates                heap state (key:dist)
  0     —          {A:0}                       [A:0]
  1     A          B:3 (3), C:1 (1)            [C:1, B:3]
  2     C          B: min(3, 1+1)=2, D:6       [B:2, B:3 (stale), D:6]
  3     B          D: min(6, 2+2)=4            [B:3 (stale), D:4, D:6 (stale)]
  4     B (stale)  no-op (already finalized)   [D:4, D:6 (stale)]
  5     D          —                            [D:6 (stale)]
  done. shortest: A=0, B=2, C=1, D=4
```

Note the "stale" entries — Dijkstra without decreaseKey just leaves them in the heap; the visited check skips them when popped.

**Why non-negative weights matter:** Dijkstra assumes that once a node is "extracted," its distance is final. With negative edges, a longer path could be cheaper, breaking that assumption. For negative edges use Bellman-Ford.

#### Topological sort — ordering with dependencies

For a DAG (directed acyclic graph), produce an order where every edge goes from earlier to later. Use for build systems, course prerequisites, task scheduling.

```
  Pseudocode — Kahn's algorithm (BFS-based topo sort)

  function topologicalSort(graph):
    indegree = compute indegree for each node       // how many incoming edges
    queue = all nodes with indegree 0
    output = []

    while queue not empty:
      node = queue.dequeue()
      output.append(node)
      for each neighbor of node:
        indegree[neighbor] -= 1
        if indegree[neighbor] == 0:
          queue.enqueue(neighbor)

    if len(output) < len(nodes):
      throw "graph has a cycle"
    return output
```

Cycle detection falls out of this naturally — if some node never reaches indegree 0, you have a cycle.

#### Union-find (disjoint set)

Not a traversal — a data structure for "are these two nodes in the same component?" O(α(n)) per op (essentially O(1) for any realistic n).

```
  Pattern — union-find for connected-components

  init:     each node is its own parent
  find(x):  walk parent links to root; path-compress as you go
  union(x, y):
            rx = find(x)
            ry = find(y)
            if rx == ry: return false   // already same set
            parent[rx] = ry              // merge (with rank/size optimization)
            return true
```

Used for: Kruskal's MST, "connected components in a graph that's growing over time," "is there a cycle if I add this edge?"

#### A* — heuristic-guided shortest path

Dijkstra explores in concentric "rings" of cost. A* adds a heuristic — an estimate of remaining distance to the goal — and prioritizes by `(cost_so_far + heuristic)`. When the heuristic is *admissible* (never overestimates), A* finds the optimal path while exploring far fewer nodes than Dijkstra.

```
  Comparison — Dijkstra vs A*

  Dijkstra:                        A* (with euclidean heuristic to G):
     S......                          S....
     ........                         .....
     ..○○○○○○                         ..○○G   ← fewer nodes explored
     .○○○○○○G                         .....
     (rings outward)                  (biased toward G)
```

Used for: pathfinding in games, robot navigation. Your `reincodes/Graph2.ts` supports this (per `me.md` — Dijkstra animation with grid obstacles).

### Move 3 — the principle

**Every graph problem is a search problem in disguise.** The structure of the graph (directed? weighted? cyclic?) and the question you're asking (any-path? shortest-path? all-reachable?) together pick the algorithm. The data structure choice is downstream — figure out the question first, the algorithm follows.

## Primary diagram

```
  The full picture — graph algorithms keyed by container

  ┌─ universal traversal kernel ───────────────────────────────────┐
  │                                                                │
  │    while frontier not empty:                                   │
  │      current = frontier.take()                                 │
  │      for each unvisited neighbor:                              │
  │        visited.add; frontier.put                               │
  │                                                                │
  └────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼  swap container ──► different algorithm
                       │
   ┌──────────────────┬┴───────────────────┬────────────────────┐
   │                  │                    │                    │
   ▼                  ▼                    ▼                    ▼
  ┌──────┐         ┌──────┐         ┌────────────┐       ┌─────────────┐
  │ BFS  │         │ DFS  │         │  Dijkstra  │       │  A*         │
  │queue │         │stack │         │  min-heap  │       │ min-heap+h  │
  │FIFO  │         │LIFO  │         │ by cost    │       │ by cost+h() │
  └──────┘         └──────┘         └────────────┘       └─────────────┘
  unweighted       cycles,           weighted              weighted +
  shortest         topo,             shortest              goal-directed
  reachable        components        (non-negative)        (admissible h)
```

## Implementation in codebase

### Use cases

**Not yet exercised in `contrl`.** No graph data structures, no BFS, no DFS, no shortest path. The closest thing is the rep counter's state graph, which is *modeled* as a graph mentally but *implemented* as a switch statement on a discriminated-union type.

The reason: a 5-node graph with hardcoded transitions doesn't earn a Graph class. The switch is more readable and avoids the indirection.

### The honest mapping

```
  src/lib/pose/rep-counter.ts — the conceptual state graph

  Nodes (V):  { 'idle', 'ready', 'down', 'bottom', 'up' }
  Edges (E):  { (idle, ready, angle ≥ readyAngle - h)
               (ready, down, angle < readyAngle - h)
               (down, bottom, angle ≤ bottomAngle + h)
               (down, ready, angle ≥ readyAngle)        ← didn't go deep enough
               (bottom, up, angle > bottomAngle + h)
               (up, ready, angle ≥ readyAngle - h, count++)  ← REP!
               (up, bottom, angle ≤ bottomAngle + h) }   ← back down

  Visualized:
                            ┌──────────┐
                            │   idle   │
                            └────┬─────┘
                                 │ angle ≥ ready-h
                                 ▼
                            ┌──────────┐
                  ┌────────►│  ready   │◄────────────┐
                  │         └────┬─────┘             │
                  │              │ angle < ready-h    │
                  │              ▼                    │
                  │         ┌──────────┐              │
                  │ angle≥  │   down   │              │ angle ≥ ready-h
                  │ ready   └────┬─────┘              │ (count++ !)
                  │              │ angle ≤ bottom+h   │
                  │              ▼                    │
                  │         ┌──────────┐              │
                  └─────────┤  bottom  │◄────┐        │
                            └────┬─────┘     │        │
                                 │ angle >    │        │
                                 │ bottom+h   │        │
                                 ▼            │        │
                            ┌──────────┐      │        │
                            │    up    │──────┘────────┘
                            └──────────┘  angle ≤ bottom+h
                                          (back down)
```

If you wanted to implement this as an actual graph: each phase is a node, each `if`/`else` clause is an edge with a predicate. The implementation is more verbose without buying anything — you'd still write the predicates and you'd lose the type-checker's exhaustiveness check on the `switch`. The interview takeaway: *recognize the graph; don't always reach for a graph data structure when the size is small enough to inline.*

### Where each graph algorithm WOULD attach

```
  Hypothetical placement map

  ┌─ feature ───────────────────┬─ algorithm ─┬─ placement ──────────────┐
  │ "what exercises unlock      │ BFS         │ src/lib/exercises/       │
  │  next from this one?"       │             │   prerequisites.ts (new) │
  ├─────────────────────────────┼─────────────┼──────────────────────────┤
  │ "shortest path to level 5   │ Dijkstra    │ src/lib/game/path.ts     │
  │  squat from current"        │             │   (new)                  │
  ├─────────────────────────────┼─────────────┼──────────────────────────┤
  │ "rep counter as a state     │ implicit DFS│ already implicit in      │
  │  graph"                     │ over states │   rep-counter.ts switch  │
  ├─────────────────────────────┼─────────────┼──────────────────────────┤
  │ "find cycles in exercise    │ DFS w/ color│ src/lib/exercises/       │
  │  progression rules"         │ marks       │   validate.ts (new)      │
  └─────────────────────────────┴─────────────┴──────────────────────────┘
```

## Elaborate

**BFS and DFS are duals of one container choice.** Look at the universal traversal kernel: change the container from `queue` to `stack` and you switch algorithms. This is the cleanest example in DSA of "same code, different data structure, different semantics."

**Dijkstra's history.** Invented in 1956 by Dijkstra in 20 minutes (his words) while sitting in a café in Amsterdam. He didn't publish it until 1959 because he hadn't yet decided it was worth publishing. The original version was O(V²) (no heap); Fredman & Tarjan got it down to O(E + V log V) with Fibonacci heaps in 1984.

**Why most "system design" problems are graph problems in disguise:**

- Microservice dependency graphs (topo sort for deploy order)
- Build systems (DAG of compile targets, cache-by-hash)
- Permission systems (reachability over an ACL graph)
- Database query planners (DAG of operator choices, cost-minimization)
- React's fiber tree (DFS reconciliation)

If you can name the graph, you can usually find the algorithm.

**Negative weights and Bellman-Ford.** When edges can be negative, Dijkstra breaks. Bellman-Ford handles negative edges in O(VE) and detects negative cycles. Used in distance-vector routing protocols (RIP), some financial arbitrage detection.

**Cross-link:** Tree algorithms (a special case of graphs) live in `04-trees-tries-and-balanced-indexes.md`. The container choices (queue, stack, heap) are taught in `03-stacks-queues-deques-and-heaps.md`.

## Interview defense

**Q: Implement BFS and explain what's load-bearing about it.**

```
  Anchor diagram

  visited = {start}; queue = [start]
  while queue:
    cur = queue.shift()             ← FIFO is the algorithm
    for n in graph[cur]:
      if n not in visited:
        visited.add(n)              ← load-bearing: prevents revisit
        queue.push(n)
```

**Answer:** Queue, visited set, frontier-empty termination. The three load-bearing parts: drop the queue and you have DFS; drop the visited set and you loop forever on any cycle; drop the termination and... well, you just don't have an algorithm. The most-forgotten part in coding interviews is the visited set — half the candidates I've seen write BFS without it.

**Q: When do you reach for BFS over DFS?**

Anchor: the level-order vs depth-first traversal diagrams. **Answer:** Unweighted shortest path (BFS naturally visits in order of distance). Level-order anything (organizational charts, web crawling by hop count). When the answer is "shallowest match" — BFS finds it first; DFS could miss it for arbitrarily long. Use DFS for cycle detection, topo sort, connected components, tree-shaped problems where you need to know "all the way down before backing up."

**Q: Why doesn't Dijkstra work with negative weights?**

Anchor: a quick "S→A=2, S→B=5, B→A=-10" counterexample sketch. **Answer:** Dijkstra relies on "once I extract a node, its distance is final." With negative edges, a longer path through a negative edge could be cheaper, but the node was already finalized. Bellman-Ford fixes this by relaxing all edges V-1 times — it doesn't assume finality. Cost: O(VE) instead of O(E log V).

**Q: Walk me through the rep counter as a graph problem.**

Anchor: the state-graph diagram in Implementation. **Answer:** Five nodes (`idle`, `ready`, `down`, `bottom`, `up`), edges labeled by angle predicates. Each frame is one "step": current state + current angle picks an edge or stays put. We implement it as a switch statement, not a `Graph` class, because at five nodes the indirection isn't worth it. If we added 50 phases (e.g., per-exercise customization), I'd factor out a transition table — at that point the data structure earns its keep.

## Validate

1. **Reconstruct.** Without re-reading: name the three load-bearing parts of BFS. *(Frontier queue, visited set, empty-queue termination.)*
2. **Explain.** Why is the rep counter implemented as a switch instead of a graph data structure? *(5 nodes inline cleanly into a switch; the type-checker enforces exhaustiveness; a `Graph` class would add indirection without buying anything at this size.)*
3. **Apply.** Design "which exercises does my current set unlock?" feature. Which traversal? *(BFS from the user's current exercise set across an "unlocks" DAG; returns reachable nodes at depth 1 — the immediate next-level options.)*
4. **Defend.** A teammate suggests representing `contrl`'s exercise catalog (~50 exercises with 1-3 prerequisites each) as an adjacency matrix. Defend or reject. *(Reject. The graph is sparse (avg degree ~2); adjacency matrix is 50² = 2500 cells, vs adjacency list at ~150 entries. Same lookup cost for "predecessors" either way. List wins.)*

## See also

- `02-arrays-strings-and-hash-maps.md` — `visited` is typically a `Set`; adjacency list is `Record<NodeId, NodeId[]>`.
- `03-stacks-queues-deques-and-heaps.md` — the container choices that pick the algorithm.
- `04-trees-tries-and-balanced-indexes.md` — trees are graphs without cycles.
- `07-recursion-backtracking-and-dynamic-programming.md` — recursive DFS, backtracking over graphs.
