# CalisthenIQ (Contrl) — Product Feature Map

**Application:** CalisthenIQ (branded "contrl")
**Platform:** Mobile-first web app (Next.js 14, max-width 480px)
**Description:** An AI-powered calisthenics coaching app that helps beginners safely build strength through controlled bodyweight progressions across Push, Pull, and Squat categories.
**User Roles:** Single user type (no auth/multi-user yet)

---

## A. First-Time Experience

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 1 | App load | See loading indicator while data fetches | Dashboard | All |
| 2 | Default levels | Start at Level 1 (Beginner) in all three categories | Skill Tree | All |
| 3 | Empty week | See empty Weekly Tracker with rest dots for past days, dashed dots for future | Weekly Tracker | All |
| 4 | Error recovery | See error message with "Retry" button if data fails to load | Dashboard | All |
| 5 | Seed data | Backend populates exercise library on first deploy via `/seed` endpoint | Backend | Admin |

---

## B. Core Features

### B1. Weekly Tracker

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 6 | Week overview | View "THIS WEEK" header with "X/7 days" workout count | Weekly Tracker header | All |
| 7 | Day labels | See abbreviated day names (Sun–Sat) | Weekly Tracker grid | All |
| 8 | Date numbers | See calendar date below each day label | Weekly Tracker grid | All |
| 9 | Today highlight | See today's column with brighter label and distinct background | Weekly Tracker grid | All |
| 10 | Workout dots | See colored category dots on days with workouts (Push: orange, Pull: cyan, Squat: purple) | Weekly Tracker dot area | All |
| 11 | Rest days | See solid gray dot on past days without workouts | Weekly Tracker dot area | All |
| 12 | Future days | See dashed-outline dot on upcoming days | Weekly Tracker dot area | All |
| 13 | Multi-category days | See multiple colored dots when a day has exercises from different categories | Weekly Tracker dot area | All |

### B2. Skill Tree — Navigation & Overview

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 14 | Category tabs | Tap Push / Pull / Squat tabs to switch between movement categories | Skill Tree tabs | All |
| 15 | Active tab styling | See selected tab highlighted with category color, border, and background | Skill Tree tabs | All |
| 16 | Tab level display | See "lvl N" on each tab showing current user level for that category | Skill Tree tabs | All |
| 17 | Level badges | See PUSH / PULL / SQUAT badges with current level numbers in header | Skill Tree header | All |
| 18 | Overall progress ring | View circular progress indicator with percentage of all exercises completed | Skill Tree header | All |
| 19 | Category progress bar | See "[CATEGORY] PROGRESS X/Y" with visual fill bar for selected tab | Below tabs | All |

### B3. Skill Tree — Level Groups

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 20 | Timeline view | See vertical timeline with 5 levels (Beginner → Expert) | Skill Tree body | All |
| 21 | Level markers | See numbered circles on timeline; filled with color if any exercise done | Timeline left edge | All |
| 22 | Level headers | See "LEVEL N — Name" with collapse chevron and exercise count | Level group header | All |
| 23 | Collapse/expand levels | Click level header to toggle visibility of exercises within | Level group header | All |
| 24 | Level clear badge | See "✓ CLEAR" when all exercises in a level are completed | Level group header | All |
| 25 | Progression notes | Read coach notes explaining how to advance to the next level | Below level header | All |
| 26 | Mastery marker | See star "MASTERY" marker at bottom of timeline | Timeline bottom | All |

### B4. Skill Card — Exercise Interaction

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 27 | Exercise card | See exercise name, set summary (e.g. "3×8"), and status indicator | Skill card (collapsed) | All |
| 28 | Locked exercises | See dimmed card with lock icon for levels not yet reached | Skill card | All |
| 29 | Completed indicator | See colored checkmark circle on fully completed exercises | Skill card header | All |
| 30 | Expand exercise | Tap an unlocked card to open the detailed editor | Skill card | All |
| 31 | Set checkboxes | Check/uncheck individual sets to mark them complete | Skill card (expanded) | All |
| 32 | Set count display | See "X/Y Sets" showing how many sets are checked | Skill card (expanded) | All |
| 33 | Edit set values | Type reps or duration into each set input field | Skill card (expanded) | All |
| 34 | Set targets | See "Goal: N" label below each set input showing the prescribed target | Skill card (expanded) | All |
| 35 | Pre-fill from history | See set inputs pre-filled with values from latest previous workout (not template) | Skill card (expanded) | All |
| 36 | Edit tempo | Type tempo value (e.g. "2-0-1-0") into the tempo input | Skill card (expanded) | All |
| 37 | Edit rest | Type rest period (e.g. "60s") into the rest input | Skill card (expanded) | All |
| 38 | Completed badge | See "◇ COMPLETED ◇" label in category color on finished exercises | Skill card (expanded) | All |

### B5. Exercise History

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 39 | Previous workouts | See "PREVIOUS" section with last 3 attempts of the same exercise | Skill card (expanded) | All |
| 40 | History dates | See formatted date (e.g. "Feb 20") for each past attempt | History row | All |
| 41 | History sets | See sets summary (e.g. "3×8,8,6") for each past attempt | History row | All |
| 42 | History completion | See checkmark (completed) or dash (incomplete) for each past attempt | History row | All |

### B6. Data Persistence & Save

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 43 | Auto-save | Changes auto-save after 600ms debounce when editing sets, tempo, or rest | Automatic | All |
| 44 | Optimistic updates | See UI update instantly before server confirms | All editable fields | All |
| 45 | Save status: saving | See "Saving..." indicator in blue during API request | Below sticky header | All |
| 46 | Save status: saved | See "Saved" indicator in green for 2 seconds after success | Below sticky header | All |
| 47 | Save status: error | See "Failed to save" indicator in red; data re-syncs from server | Below sticky header | All |
| 48 | Insert new exercise | Checking a set on an exercise not in today's session auto-creates the session entry | Automatic | All |

---

## C. Secondary Features

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 49 | Exercise search | Query exercises by name or tags (API available, not exposed in UI yet) | Backend `/exercises/search` | API only |
| 50 | Data export | Export all user data as JSON snapshot | Backend `/export` | API only |
| 51 | Data import | Import JSON data to restore or migrate | Backend `/import` | API only |

---

## D. Account & Settings

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| — | *No authentication, profile, or settings screens exist yet* | — | — | — |

---

## E. Help & Support

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| — | *No help center, FAQ, or support features exist yet* | — | — | — |

---

## F. Engagement & Retention Features

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 52 | Level progression | Advance through 5 difficulty levels per category as exercises are completed | Skill Tree | All |
| 53 | Exercise unlocking | New exercises unlock as user reaches higher levels | Skill Tree | All |
| 54 | Visual progress | See filled dots, progress bars, and rings track overall advancement | Skill Tree header/timeline | All |
| 55 | Category color coding | Consistent color identity (orange/cyan/purple) across all UI elements | App-wide | All |
| 56 | Weekly streak tracking | See workout dots accumulate across the week | Weekly Tracker | All |
| 57 | Completion badges | See "✓ CLEAR" on completed levels and "◇ COMPLETED ◇" on exercises | Skill Tree | All |

---

## Exercise Library

~75 exercises across 5 levels × 3 categories:

| Category | Level 1 (Beginner) | Level 2 (Novice) | Level 3 (Intermediate) | Level 4 (Advanced) | Level 5 (Expert) |
|----------|-------------------|-------------------|----------------------|--------------------|--------------------|
| **Push** | Negative Push-ups, Scapula Push-ups, Plank Hold | Normal Push-ups, Scapula Pushups, Plank Hold | Tricep Extensions, Diamond Push-ups, Wide Push-ups | Archer Pushups, Explosive Pushups, Diamond Pushups | One-Arm Push-ups, Archer Push-ups, Ring Dips |
| **Pull** | TRX Lat Pull-down, TRX Inverted Row, TRX Passive Hang | TRX Inverted Row (straight legs), TRX Scapula Pullups | TRX Pullups Band Assisted, TRX Inverted Row | TRX Negative Pullups, TRX Pullups Band Assisted | TRX Pullups, TRX Pullups Band Assisted |
| **Squat** | Deep Squats, Narrow Stance Squats, Bodyweight Squats | TRX Bulgarian Squats, Narrow Stance Squats | Cossack Squats, Bulgarian Split Squats | Assisted Pistol Squat, Cossack Squats | Pistol Squats, TRX Assisted Pistol Squats |

---

## Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/user/data` | GET | Fetch all user progress and weekly workouts |
| `/user/data` | PUT | Update entire user data object |
| `/user/levels` | GET | Fetch current category levels |
| `/user/levels` | PUT | Update a single category level |
| `/exercises/levels` | GET | Get full exercise library organized by level |
| `/exercises` | GET | Get exercises filtered by level/category |
| `/exercises/search` | GET | Search exercises by name or tags |
| `/health` | GET | Health check |
| `/seed` | POST | Initialize blob storage with exercise data |
| `/export` | GET | Export all data as JSON |
| `/import` | POST | Import JSON data |

---

## Total Feature Count: **57**

---

## Feature Map Summary

CalisthenIQ is a single-screen calisthenics workout tracker built around two core sections: a **Weekly Tracker** calendar showing workout activity across the week, and an interactive **Skill Tree** that organizes ~75 bodyweight exercises into 5 progressive difficulty levels across Push, Pull, and Squat categories. Users tap exercise cards to expand them, log their sets (reps or duration), tempo, and rest periods — with changes auto-saving optimistically via a debounced write queue. The app pre-fills set inputs with values from the user's most recent workout and shows the last 3 attempts for context. Exercises unlock as users progress through levels, creating a gamified progression system with visual indicators (progress rings, colored dots, completion badges) that reinforce consistency. There is no authentication, social, or settings layer yet — it's a focused, mobile-first workout logging tool.

---

## Unclear / Needs Exploration

- **Level advancement trigger:** How exactly does a user's level increase from 1 → 2? Is it automatic when all exercises at that level are completed, or manual via the `/user/levels` PUT endpoint?
- **Exercise search UI:** The search endpoint exists but isn't wired to the frontend yet.
- **Data export/import:** Available as API endpoints but no UI to trigger them.
- **Multi-week history:** `weeklyProgress` stores sessions across weeks, but the Weekly Tracker only shows the current week. Historical weeks are not viewable.
- **Workout session creation:** When no session exists for today and user checks a set, a new session is created with `level: 1` — should this match the user's current level?
- **Equipment filtering:** Exercises have an optional `equipment` field (e.g. "TRX") but there's no filter or indicator in the UI.
- **Notes field:** `BaseExercise` has a `notes` field but it's not displayed in the Skill Card.
- **Progression notes source:** Coach progression notes exist in workout level data but it's unclear how they get authored/updated.

---

## Assumptions

- All features documented are based on reading the source code, not runtime testing.
- The exercise library content is derived from mock data files and may differ from production seed data.
- "~75 exercises" is an estimate based on ~5 exercises per level per category (5 × 3 × 5).
- The app is intended for mobile use based on the 480px max-width constraint.
- "contrl" branding appears in the page layout but the project is named "CalisthenIQ" in package.json.
