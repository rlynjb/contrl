# Study — Software design (APOSD applied to contrl)

Code-level design audit. Eight concept files walk Ousterhout's primitives — deep modules, information hiding, complexity, layering, readability — and apply each to **this repo's actual files**. The framework lives in `read-aposd.md`; the findings live here.

## The through-line

Complexity is the enemy. Deep modules are the weapon. Every primitive in this guide is one cut of the same blade: hide what the caller doesn't need to know.

```
  the discipline in one picture

  ┌─ what the caller sees ──────────────┐
  │  small, obvious interface           │ ← keep this tiny
  └─────────────────┬───────────────────┘
                    │
  ┌─ what the module hides ─────────────┐
  │  rich behaviour, edge cases,        │ ← let this grow
  │  cross-cutting concerns             │
  └─────────────────────────────────────┘
```

When the top box grows faster than the bottom one, complexity leaks out — every caller now carries decisions the module could have owned. That's classitis, pass-through, leaked decomposition, and forced configuration all wearing different costumes.

## Map

```
  01-complexity-in-this-codebase.md     the zoom-out — where complexity lives
  02-deep-vs-shallow-modules.md         interface ÷ behaviour
  03-information-hiding-and-leakage.md  facts known in two places
  04-layers-and-abstractions.md         pass-through methods and adjacent layers
  05-pull-complexity-downward.md        knobs the module could decide itself
  06-errors-and-special-cases.md        try/except everywhere; define them out
  07-readability.md                     names · comments · consistency · obviousness
  08-red-flags-audit.md                 the capstone checklist
```

Reading order: 01 first (it sets the scope). Then 08 last (it's the index of fixes ranked across the whole repo). 02–07 in any order — each concept stands alone.

## What this is and isn't

- **Is:** an audit of *this* repo's code-level design. Every claim cites a real path. Findings ranked worst-first per concept.
- **Isn't:** a tutorial. For the conceptual depth of each primitive, read APOSD (the book). For system architecture and DSA, see `.aipe/study-system-design-dsa/`. For security, testing, and AI patterns, see their sibling guides.

## Source

John Ousterhout, *A Philosophy of Software Design* (2nd edition). The primitives are his; the findings are about contrl.
