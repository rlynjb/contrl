# 04 — Trees, tries, and balanced indexes

**Hierarchies / binary search trees / tries / balanced trees (AVL, red-black, B-tree)** — Industry standard.

## Zoom out, then zoom in

A tree is "a graph with no cycles and exactly one path between any two nodes." That's the math. The engineering view: a tree is what you reach for when your data has a *hierarchy* (file system, DOM, JSON) or when you need *O(log n) ordered lookup* (database index, sorted map).

```
  Zoom out — where trees live in contrl

  ┌─ UI layer ───────────────────────────────────────────────────┐
  │  React component tree (implicit, runtime-managed)            │
  │    <App> → <Home> → <SessionList> → <SessionRow>             │
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ State layer ─────────────▼──────────────────────────────────┐
  │  ★ THIS CHAPTER — partially via FSM (rep-counter) ★          │
  │  The rep counter's phase graph is tree-shaped (a DAG over    │
  │   the phases, but topologically tree-like for any single rep)│
  └───────────────────────────┬──────────────────────────────────┘
                              │
  ┌─ Storage layer ───────────▼──────────────────────────────────┐
  │  SQLite B-tree indexes  ← every WHERE clause walks one       │
  │    (taught in study-database-systems/ for internals)         │
  └──────────────────────────────────────────────────────────────┘
```

In `contrl`, the trees you can name explicitly are: **React's component tree** (implicit, the framework manages it) and **SQLite's B-tree indexes** (taught in detail in `study-database-systems/`). You haven't built a BST or a trie in this repo. The chapter still teaches them as curriculum.

## Structure pass

**Layers.**

- **General tree** — nodes with children; n-ary, no ordering constraint.
- **Binary tree** — each node has ≤ 2 children. No search property; just shape.
- **Binary search tree (BST)** — binary tree where left subtree < node < right subtree. Enables O(log n) lookup *if balanced*.
- **Balanced BST** — AVL, red-black: BST with extra invariants that guarantee O(log n) even after inserts and deletes.
- **Trie** — tree where each edge is a character; root-to-leaf path spells a string. O(m) lookup for a string of length m.
- **B-tree** — wider-fanout balanced tree designed for disk pages. Each node holds many keys. The database index workhorse.

**Axis traced — lookup cost (how fast can you find a value?).**

```
  axis = "how do you find a value given a key?"

  general tree:    walk from root, no guidance        → O(n) scan
  binary tree:     same, no ordering                  → O(n)
  BST (balanced):  comparison narrows search by half  → O(log n)
  BST (unbalanced):degenerated to linked list          → O(n) — the bug
  trie:            walk one character at a time        → O(m) — m = key length
  B-tree:          comparison + page-aligned fanout    → O(log_B n) page reads
```

**Seams.** The boundary that flips the axis-answer is **the search invariant**. A binary tree without the search property is just a hierarchy — useful for representing things, useless for lookup. Adding the search property turns it into a search structure. Losing balance turns the search structure back into a linear scan.

## How it works

### Move 1 — the mental model

```
  Pattern — the four shapes

  General tree (n-ary):              Binary search tree:
        root                                [ 5 ]
       / | \                                /     \
      A  B  C                          [ 3 ]      [ 8 ]
      |     |\                         /   \      /   \
      D     E F                    [ 1 ] [ 4 ] [ 7 ] [ 9 ]

  Trie (prefix tree):                B-tree (database index):
        root                              [ . . . . . ]
       /  |  \                            /  |  |  |  \
      p   s   c                       page page page page page
      |   |   |                       ...  ...  ...  ...  ...
      u   q   a
      |   |   |
      s   u   t
      |   |   |
      h$  a   $
          |
          t$

  ($ = end-of-word marker)
```

The "binary" in BST is about *shape* (each node has ≤ 2 children); the "search" is about *order* (left < node < right). Both invariants together give you O(log n) lookup *if* the tree is balanced.

### Move 2 — the moves you'll make

#### Tree traversal — three classical orders

For a binary tree, three traversal orders cover almost all algorithms:

```
  Pattern — three traversal orders

  inorder:    left → node → right     (visits BST in sorted order)
  preorder:   node → left → right     (good for copy / serialize)
  postorder:  left → right → node     (good for delete / aggregate up)

  Example tree:        5
                      / \
                     3   8
                    / \   \
                   1   4   9

  inorder:    1, 3, 4, 5, 8, 9       ← BST sorted!
  preorder:   5, 3, 1, 4, 8, 9       ← serializable, root-first
  postorder:  1, 4, 3, 9, 8, 5       ← children before parent
```

```
  Pseudocode — recursive inorder

  function inorder(node):
    if node == null: return
    inorder(node.left)               // ← all-left-subtree first
    visit(node.value)                // ← then the node itself
    inorder(node.right)              // ← then all-right-subtree

  // For a BST, this visits values in sorted order.
```

For an n-ary tree there's only "preorder" (node first) and "postorder" (node last); "inorder" doesn't generalize because there's no fixed "middle" child.

#### BST insertion and the balance problem

```
  Pseudocode — BST insert (unbalanced)

  function insert(root, value):
    if root == null:
      return new Node(value)
    if value < root.value:
      root.left = insert(root.left, value)
    else:
      root.right = insert(root.right, value)
    return root

  // O(h) where h = tree height
  // Balanced: h = log n → O(log n)
  // Worst:    h = n     → O(n) — degenerate (sorted input!)
```

```
  Execution trace — insert(1,2,3,4,5) into an empty BST

  insert 1: [1]
  insert 2: [1]                        ← 2 > 1, goes right
              \
              [2]
  insert 3:   [1]
                \
                [2]                    ← linear chain forming
                  \
                  [3]
  insert 4:   [1]
                \
                [2]
                  \
                  [3]
                    \
                    [4]
  insert 5:   [1]----[2]----[3]----[4]----[5]
              (degenerate to a linked list — O(n) lookup)
```

This is the load-bearing failure mode of unbalanced BSTs: sorted input destroys them. Balanced BSTs (AVL, red-black) fix this with rotations.

#### Rotations — the balance-repair primitive

A rotation rearranges three nodes without violating the BST invariant.

```
  Pattern — single right rotation

  before:                after:
        Q                     P
       / \                   / \
      P   C       ──►       A   Q
     / \                       / \
    A   B                     B   C

  invariant before: A < P < B < Q < C
  invariant after:  A < P < B < Q < C   ✓ (unchanged)
  height(Q-as-root): max(2, ...) → height(P-as-root): max(2, ...)
```

AVL trees track height per subtree and rotate when the height difference exceeds 1. Red-black trees use color invariants instead. Both guarantee O(log n) height.

#### Trie — prefix lookup

A trie stores a *set of strings* with each character as one edge.

```
  Pattern — trie storing {"push", "pull", "pulled"}

           root
          /
         p
         |
         u
        / \
       s   l
       |   |
       h*  l*
            \
             e
             |
             d*

  * = end-of-word marker

  lookup("pul"):   walk p→u→l, no * at l, but children exist
                   → "pul" is a prefix but not a complete word
  lookup("pull"):  walk p→u→l→l, * present → present
```

Lookup is O(m) where m is the string length — independent of n (number of stored words). That's the trie's superpower for autocomplete and spell-check.

```
  Pseudocode — trie insert

  function insert(trie, word):
    node = trie.root
    for each char in word:
      if char not in node.children:
        node.children[char] = new Node()
      node = node.children[char]
    node.isWord = true
```

Where you'd reach for it in `contrl`: autocomplete on exercise names (search for "push" → "push-up", "push press"). Not yet exercised. Could attach in a hypothetical `src/lib/exercises/search.ts`.

#### B-tree — the database index

A B-tree is a generalization of BST where each node holds many keys (often 100+) and the tree is *much* wider than it is tall. Designed for disk: each node fits in one disk page (4KB or 8KB typically), so one node read = one disk seek.

```
  Pattern — B-tree node (simplified)

  node (one disk page, ~4KB):
   ┌───┬───┬───┬───┬───┐
   │ 17│ 42│ 89│ 134│ 201│       ← keys (sorted)
   └───┴───┴───┴───┴───┘
    ↓   ↓   ↓   ↓   ↓   ↓
   page page page page page page  ← child pointers
   (<17)(17-42)(42-89)(89-134)(134-201)(>201)

  Tree height for n=1M with B=100: log_100(1M) ≈ 3
  → 3 disk reads to find any row, vs ~20 reads for a binary tree
```

The fanout (`B`) is what makes B-trees the database-storage workhorse. A binary tree with n=1M needs log_2(1M) ≈ 20 levels; a B-tree with B=100 needs log_100(1M) ≈ 3 levels. When each level costs a disk seek (~10ms historically, ~100µs on SSD), the difference is 60× faster.

**Cross-link:** SQLite uses B-trees for every index, including the primary key. The internals (page format, splitting, balance) are taught in `study-database-systems/`. `contrl` benefits from this every time it queries `sessions WHERE date > X`.

### Move 2 variant — load-bearing skeleton of a balanced BST

A balanced BST's kernel is **four parts**:

1. **The search invariant** — left < node < right. Without it, you have a binary tree, not a search tree.
2. **The balance invariant** — height(left) and height(right) differ by ≤ 1 (AVL) or color-based equivalent (red-black). Without it, sorted input degenerates to a linked list.
3. **The rotation primitive** — the rebalance move. Without rotations, you can't restore balance after insert/delete.
4. **The balance check after each op** — walk back up to the root, fix any violations. Without this, balance silently drifts.

Drop any one and the structure breaks differently: drop (1) and lookup becomes O(n); drop (2) and worst-case ops become O(n); drop (3) and the structure can't repair itself; drop (4) and violations accumulate.

### Move 3 — the principle

**A tree is a hierarchy that you exploit for fast lookup, fast aggregation, or both.** The search invariant turns hierarchy into a guided search; the balance invariant guarantees the guidance stays cheap. Without those two together, you have a fancy linked list.

## Primary diagram

```
  The full picture — tree variants and their access patterns

  ┌─ general tree (n-ary) ─────────────────────────────────────────┐
  │   no order · just hierarchy · React components, DOM, JSON      │
  │   traversal: O(n) — visit everyone                             │
  └────────────────────────────────────────────────────────────────┘

  ┌─ BST (binary search tree) ─────────────────────────────────────┐
  │   left < node < right · O(h) lookup · h depends on balance     │
  │   balanced: O(log n) · unbalanced (sorted input): O(n)         │
  └────────────────────────────────────────────────────────────────┘

  ┌─ balanced BST (AVL, red-black) ────────────────────────────────┐
  │   rotations enforce O(log n) height · TreeMap, std::map        │
  │   in-memory ordered key-value store                            │
  └────────────────────────────────────────────────────────────────┘

  ┌─ trie ─────────────────────────────────────────────────────────┐
  │   each edge = one character · O(m) lookup, m = key length      │
  │   autocomplete, IP routing, spell-check                        │
  └────────────────────────────────────────────────────────────────┘

  ┌─ B-tree ───────────────────────────────────────────────────────┐
  │   wide fanout · disk-page sized nodes · O(log_B n) page reads  │
  │   every database index — see study-database-systems            │
  └────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### Use cases

- **The React component tree** is the implicit one. Every screen in `contrl` (e.g. `app/(tabs)/index.tsx`) compiles to a tree of components. React traverses this tree on every render to figure out what changed. You don't write the traversal; React does.
- **SQLite B-tree indexes** back every query against `sessions`. The schema (in `src/data/db/schema.ts`, not part of this audit) declares indexes on `date` and `category`; SQLite stores those as B-trees. Cross-link: `study-database-systems/`.
- **The rep counter's phase set** (`src/lib/pose/rep-counter.ts:5`) is a small state graph — *not* literally a tree, more a DAG, but worth naming here because state-machine state spaces are conceptually tree-walked when you enumerate execution paths.

### Code side by side

```
  src/lib/pose/rep-counter.ts (lines 5-7)

  export type RepPhase = 'idle' | 'ready' | 'down' | 'bottom' | 'up'
                          │
                          └─ the state set. A finite list of named nodes;
                             the transition function (the `switch` at
                             lines 36-71) is the edge set. Together they
                             form a small state graph — not a tree, but
                             traversal-by-transition is what walks it.

  rep-counter.ts (the state-machine kernel, lines 36-71)

  switch (this.phase) {
    case 'idle':
      if (angle >= readyAngle - hysteresis) this.phase = 'ready'   ← idle→ready
      break
    case 'ready':
      if (angle < readyAngle - hysteresis) this.phase = 'down'     ← ready→down
      break
    case 'down':
      if (angle <= bottomAngle + hysteresis) this.phase = 'bottom' ← down→bottom
      else if (angle >= readyAngle) this.phase = 'ready'           ← down→ready (reset)
      break
    case 'bottom':
      if (angle > bottomAngle + hysteresis) this.phase = 'up'      ← bottom→up
      break
    case 'up':
      if (angle >= readyAngle - hysteresis) {                       ← up→ready (rep!)
        this.count++
        this.phase = 'ready'
        repCompleted = true
      } else if (angle <= bottomAngle + hysteresis) {              ← up→bottom (re-down)
        this.phase = 'bottom'
      }
      break
  }
       │
       └─ the state graph drawn out:
              idle ──► ready ──► down ──► bottom ──► up ──► ready ──► (count++)
                          ▲       │                    │
                          └───────┘                    │
                          (didn't go deep enough)     │
                                                      ▼
                                                   bottom
                                                   (went back down)

          This is a directed graph, not a tree. The "tree" framing is the
          execution-history tree: from `idle`, every possible sequence of
          angles produces a different walk; the set of walks is a (very
          deep) tree of possibilities. State machines are how you compress
          that infinite tree into a finite graph.

          Five states, five cases. Hysteresis = the asymmetric thresholds
          (readyAngle-hysteresis vs readyAngle); prevents jitter from
          oscillating across a boundary.
```

### Where each tree variant WOULD attach if exercised

```
  Hypothetical placement map

  ┌─ feature ─────────────────────┬─ tree ─────────┬─ placement ────────────┐
  │ exercise-name autocomplete    │ trie           │ src/lib/exercises/     │
  │                               │                │   search.ts (new)      │
  ├───────────────────────────────┼────────────────┼────────────────────────┤
  │ in-memory ordered map         │ red-black BST  │ rarely needed in JS;   │
  │   (sorted by some key)        │                │   sort + binary search │
  │                               │                │   usually wins         │
  ├───────────────────────────────┼────────────────┼────────────────────────┤
  │ persistent ordered storage    │ B-tree         │ already used by SQLite;│
  │                               │                │   not your code        │
  └───────────────────────────────┴────────────────┴────────────────────────┘
```

## Elaborate

**Why JS doesn't have a balanced BST in stdlib.** Most languages with ordered maps (`std::map` in C++, `TreeMap` in Java) use red-black trees. JS doesn't ship one because `Map` (hash-based, O(1) but unordered) plus `sort` (O(n log n)) usually covers the use cases. Libraries like `sorted-btree` exist if you need it.

**Tries vs hash maps for string keys.** Hash maps are O(1) average but require hashing the whole string (O(m)). Tries are O(m) but never hash. For autocomplete (prefix queries), tries win because they natively support "find all words starting with 'pu'." Hash maps can't do prefix queries at all — they'd need a full scan.

**Self-balancing flavors:**

- **AVL** — strict balance (height diff ≤ 1). Faster lookup, slower insert (more rotations).
- **Red-black** — looser balance (height ratio ≤ 2). Slower lookup, faster insert. The standard for in-memory ordered maps.
- **Splay tree** — no balance invariant, but recently-accessed nodes move toward root. Good for skewed access patterns.
- **B-tree** — wide fanout. Disk-oriented. The choice for any on-disk index.
- **LSM tree** — append-only log with periodic compaction. The choice for write-heavy workloads (RocksDB, Cassandra).

**Cross-link:** B-tree internals (page format, page splits, write amplification) live in `study-database-systems/`. The React fiber tree (component reconciliation as tree diff) lives in `study-frontend-engineering/`.

## Interview defense

**Q: Walk me through inserting into a BST and explain when it goes wrong.**

```
  Anchor diagram

  insert(value, root):
    if root null: create node
    elif value < root.value: recurse left
    else: recurse right

  → O(log n) when balanced
  → O(n) when degenerate (sorted input → linked-list shape)

  fix: AVL / red-black with rotations after each insert
```

**Answer:** Walk from root; left if less, right if greater; create a node at the empty slot. O(h) where h is tree height. Goes wrong with sorted input — every insert lands at the right, tree becomes a linked list, h=n, lookups are O(n). The fix is a self-balancing flavor like AVL or red-black, which rotates after each insert to keep h = O(log n).

**Q: Why does SQLite use B-trees instead of binary search trees?**

Anchor: the B-tree fanout diagram. **Answer:** Disk I/O. A binary tree with n=1M items has ~20 levels; each lookup is 20 disk seeks. A B-tree with B=100 has ~3 levels; each lookup is 3 page reads. Pages are aligned to filesystem blocks (4KB or 8KB), so each "node read" is one disk op. Fanout converts tree-depth into in-page-search (which is cheap, in RAM after the page loads). Cross-link to `study-database-systems/` for the page layout.

**Q: When would you use a trie over a hash map?**

Anchor: the trie diagram. **Answer:** Prefix queries. A hash map can answer "is 'push' in the set?" in O(1). A trie can answer that *and* "what words start with 'pu'?" in O(m + k) where k is the number of matches. Hash maps physically can't do prefix queries — the hash destroys the prefix relationship. Autocomplete, IP routing tables, and spell-check are the canonical trie use cases.

## Validate

1. **Reconstruct.** Without re-reading: name the three classical binary-tree traversals and what each one is good for. *(Inorder = sorted output of BST; preorder = serialize/copy; postorder = aggregate up / delete.)*
2. **Explain.** Why does the rep counter (`src/lib/pose/rep-counter.ts:36-71`) use hysteresis on its phase transitions? *(Asymmetric thresholds prevent jitter at boundaries — if a noisy angle oscillates around `readyAngle`, hysteresis ensures it must cross by `hysteresis` units before flipping. Without it, you'd count phantom reps.)*
3. **Apply.** Design an autocomplete for exercise names ("pull-up", "push press"). Which structure? *(Trie. O(m) lookup independent of catalog size, and prefix queries are native.)*
4. **Defend.** A teammate suggests storing the `sessions` table sorted in a balanced BST in JS instead of letting SQLite handle it. Defend or reject. *(Reject. SQLite's B-tree is persistent across launches, handles disk efficiently, and is already there. A JS BST would lose the index on every cold start and have no persistence story. Also, `contrl`'s n is too small for the difference to matter — `Array.sort` is fine.)*

## See also

- `02-arrays-strings-and-hash-maps.md` — hash maps are the typical alternative to ordered trees.
- `03-stacks-queues-deques-and-heaps.md` — heaps are array-stored trees with a different invariant.
- `05-graphs-and-traversals.md` — trees are a special case of graphs.
- `07-recursion-backtracking-and-dynamic-programming.md` — recursion is how you walk trees.
- `study-database-systems/` — B-tree internals for SQLite indexes.
- `study-frontend-engineering/` — React's fiber tree.
