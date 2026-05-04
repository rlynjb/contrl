# contrl — Interview Prep Guide

A book-style preparation guide for defending the design and implementation of contrl, a bodyweight-fitness mobile app built on Expo/React Native, SQLite, MediaPipe pose detection, and the Notion API. Written from the perspective of a staff engineer who has interviewed at scale: opinionated, file-specific, and unafraid to call out the parts of this codebase that aren't perfect — because being able to name those parts is exactly what separates the engineer from the user.

## Table of Contents

1. [Preface — What this project is really about](01-preface.md)
2. [System architecture](02-system-architecture.md)
3. [Frontend engineering](03-frontend-engineering.md)
4. [AI engineering (on-device pose detection)](04-ai-engineering.md)
5. [Data modelling](05-data-modelling.md)
6. [Reliability and error handling](06-reliability-and-error-handling.md)
7. [Local-first sync and "API design"](07-sync-and-api-design.md)
8. [Developer process](08-developer-process.md)
9. [Ownership and judgment](09-ownership-and-judgment.md)
10. [Data structures and algorithms](10-data-structures-and-algorithms.md)
11. [Defending AI-assisted work](11-defending-ai-assisted-work.md)
12. [What I'd do differently](12-what-id-do-differently.md)
13. [Appendix — Complexity cheat sheet](13-appendix-complexity-cheat-sheet.md)

## How to use

Read in order the first time — chapters build on each other. Each chapter (2–9) follows the same shape: opening narrative → ASCII diagram → three interview questions tagged `[mid]` `[senior]` `[arch]` → "the hard question" the candidate usually dodges. Practise the hard questions out loud. Re-run `/aipe:interview` after any significant codebase change so the prep stays in sync.
