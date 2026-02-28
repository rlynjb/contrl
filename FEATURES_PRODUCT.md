# FEATURES_PRODUCT.md — contrl

**Application:** contrl
**URL / Platform:** Progressive Web App (mobile-first, installable via browser). Hosted on Netlify.
**Description:** A gate-based calisthenics progression tracker that guides users from beginner to expert through structured bodyweight exercises across three categories (Push, Pull, Squat), using a 3-consecutive-clean-session gate system to ensure mastery before level advancement.
**User Roles:** Single user type (no auth, single-player progression)

---

## A. First-Time Experience

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 1 | PWA Install Prompt | Install the app to home screen from mobile browser | Browser native prompt | All users |
| 2 | Default User Creation | System auto-creates a user with all categories at Level 1 (Beginner) | Automatic on first load | All users |
| 3 | Empty Home Dashboard | See 0/3 sessions completed, all categories showing "Not yet", no streak | Home `/` | All users |
| 4 | Empty History State | See "No sessions logged yet. Start training!" message | History `/history` | All users |
| 5 | Skill Tree Initial State | See Level 1 nodes as "Open" (cyan outline), Levels 2–5 as "Locked" (dimmed) across all 3 categories | Tree `/tree` | All users |
| 6 | Guided First Action | "Log Push Session" CTA button on home page directs to first workout | Home `/` | All users |
| 7 | No Explicit Onboarding | App teaches by doing — no tutorial, tooltips, or walkthrough. User starts by tapping "Log Session" | App-wide | All users |

---

## B. Core Features

### B1. Log Workout (3-Phase Flow)

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 8 | Category Selection | Choose Push, Pull, or Squat to begin logging a session | Log `/log` → Phase 1 | All users |
| 9 | Category Info on Selection | See current level, level name, and gate progress (X/3 clean sessions) for each category before choosing | Log `/log` → Phase 1 | All users |
| 10 | Pre-selected Category via Link | Navigate directly to logging a specific category via deep link (`/log?category=push`) | Home CTA → Log `/log` | All users |
| 11 | Exercise List Display | See all exercises for the chosen category at user's current level, with target sets × reps/seconds | Log `/log` → Phase 2 | All users |
| 12 | Per-Set Checkbox | Toggle each set as completed or not completed via a checkbox | Log `/log` → Phase 2 | All users |
| 13 | Per-Set Rep/Hold Input | Enter actual reps (or hold seconds for isometric exercises) per set via number input | Log `/log` → Phase 2 | All users |
| 14 | Pre-filled Targets | Rep/hold inputs are pre-filled with the exercise's target value | Log `/log` → Phase 2 | All users |
| 15 | Live Target Comparison | See "/ [target]" next to each input so user always knows the goal | Log `/log` → Phase 2 | All users |
| 16 | Visual Set Feedback | Checkbox shows: green ✓ (checked + met target), yellow – (checked + below target), empty (unchecked) | Log `/log` → Phase 2 | All users |
| 17 | Session Notes | Add optional free-text notes to the workout session | Log `/log` → Phase 2 (textarea) | All users |
| 18 | Save Session | Submit the completed workout for evaluation and persistence | Log `/log` → "Save Session" button | All users |
| 19 | Back to Category Select | Return to category selection without saving | Log `/log` → ← button | All users |

### B2. Session Result

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 20 | Session Confirmation | See "SESSION LOGGED" confirmation immediately after saving | Log `/log` → Phase 3 | All users |
| 21 | Motivational Message | See an encouraging message scaled to completion percentage (100% = "Perfect session!", <50% = "Every rep counts.") | Log `/log` → Phase 3 | All users |
| 22 | Overall Completion % | See aggregate completion percentage with colored progress bar (emerald=100%, cyan=75%+, amber=<75%) | Log `/log` → Phase 3 | All users |
| 23 | Gate Progress Update | See current gate status: "X/3 clean sessions" or "Gate cleared!" | Log `/log` → Phase 3 | All users |
| 24 | Clean Session Indicator | See "Clean session — keep this up!" (green) if all targets met, or "Counter resets on non-clean session" (muted) if not | Log `/log` → Phase 3 | All users |
| 25 | Per-Exercise Breakdown | See each exercise's completion status: "Met" (green) or "X/Y sets" (muted) with individual progress bars | Log `/log` → Phase 3 | All users |
| 26 | Level Up Notification | See inline "LEVEL UP!" banner with category and new level when gate is passed (3/3 clean sessions) | Log `/log` → Phase 3 | All users |
| 27 | Log Another Session | Start a new workout immediately from result screen | Log `/log` → "Log Another" button | All users |
| 28 | Return to Category Select | Go back to category selection from result screen | Log `/log` → "Done" button | All users |

### B3. Gate Passed Celebration

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 29 | Level Up Modal | See full-screen overlay with "LEVEL UP!" text, old level → new level transition, glow animation | Modal overlay (triggered from Log result) | All users |
| 30 | Level Transition Visual | See previous level number and name alongside new level number and name with arrow between them | GatePassedModal | All users |
| 31 | Category-Specific Badge | See the leveled-up category highlighted with its accent color | GatePassedModal | All users |
| 32 | Dismiss Celebration | Close the modal to continue using the app | GatePassedModal → "Continue" button | All users |

### B4. Home Dashboard

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 33 | Weekly Session Counter | See "X/3 sessions completed" for the current week | Home `/` header | All users |
| 34 | Week Progress Bar | See visual progress toward completing all 3 category sessions this week | Home `/` | All users |
| 35 | Streak Counter | See consecutive weeks with all 3 sessions completed (only if > 0) | Home `/` top-right badge | All users |
| 36 | Category Status Cards | See each category's current level, level name, gate progress, and weekly completion status | Home `/` → 3 category rows | All users |
| 37 | Next Session CTA | Tap "Log [Category] Session" to jump directly to logging the first incomplete category | Home `/` → CTA button | All users |
| 38 | Week Complete Message | See "All sessions logged this week!" banner when all 3 categories are done | Home `/` (replaces CTA) | All users |
| 39 | Category Glow on Completion | Category card glows with its accent color (orange/cyan/magenta) when that category is completed for the week | Home `/` → category cards | All users |

### B5. Skill Tree

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 40 | 3-Column Grid Layout | See Push, Pull, and Squat as side-by-side vertical tracks | Tree `/tree` | All users |
| 41 | Column Headers | See category badge + current level (L1–L5) at top of each column | Tree `/tree` header | All users |
| 42 | Level Nodes (L1–L5) | See 5 levels per category rendered top-down (L5 at top, L1 at bottom) | Tree `/tree` grid | All users |
| 43 | Node State: Locked | See dimmed circle with level number for levels above user's current level (40% opacity) | Tree `/tree` node | All users |
| 44 | Node State: Open | See cyan-outlined circle for user's current level with 0 consecutive passes | Tree `/tree` node | All users |
| 45 | Node State: In-Progress | See glowing cyan circle with "X/3" pass counter below for current level with 1–2 passes | Tree `/tree` node | All users |
| 46 | Node State: Passed | See glowing green circle with ✓ checkmark for completed levels | Tree `/tree` node | All users |
| 47 | Connector Lines | See vertical lines between levels, colored cyan (at/below user level) or gray (above) | Tree `/tree` between nodes | All users |
| 48 | Tap to Expand Node | Tap any node with exercises to reveal detail panel below the grid | Tree `/tree` → tap node | All users |
| 49 | Expanded: Exercise List | See all exercises for that category/level with targets (sets × reps or sets × seconds) | Tree `/tree` → detail panel | All users |
| 50 | Expanded: Gate Progress Dots | See 3 circles indicating consecutive pass progress (filled = completed, empty = remaining) | Tree `/tree` → detail panel | All users |
| 51 | Expanded: Gate Status Text | See "Gate cleared" (green), "Locked — complete previous level first" (muted), or clean session count | Tree `/tree` → detail panel | All users |
| 52 | Close Expanded Panel | Dismiss the detail panel via × button or tapping another node | Tree `/tree` → × button | All users |

### B6. History

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 53 | Sessions Grouped by Week | See sessions organized by calendar week (Monday–Sunday) with date range headers | History `/history` | All users |
| 54 | Week Category Dots | See 3 colored dots (push/pull/squat) per week indicating which categories were logged | History `/history` → week header | All users |
| 55 | Session Card Summary | See category badge, date, level, and completion percentage for each session | History `/history` → session cards | All users |
| 56 | Expandable Session Detail | Tap a session card to expand and see per-exercise breakdown | History `/history` → tap card | All users |
| 57 | Per-Exercise Progress Bars | See completion % bar for each exercise: emerald if target met, muted if not | History `/history` → expanded card | All users |
| 58 | Exercise Status Label | See "Met" (green) or "X/Y sets" (muted) per exercise | History `/history` → expanded card | All users |
| 59 | Session Notes Display | See workout notes (if any) in italicized muted text below exercises | History `/history` → expanded card | All users |
| 60 | Streak in History Header | See current streak counter in top-right of History page (if > 0) | History `/history` header | All users |

---

## C. Secondary Features

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 61 | Automatic Week Reset | System auto-resets weekly progress on Monday (archives previous week, clears category completion) | Automatic on app load | All users |
| 62 | Streak Calculation | System computes streak from all archived weeks (consecutive complete weeks from most recent backward) | Automatic | All users |
| 63 | Gate Counter Reset | System resets consecutive pass counter to 0 on any non-clean session | Automatic on session save | All users |
| 64 | Auto Level-Up | System automatically advances user's level when gate reaches 3 consecutive passes | Automatic on session save | All users |
| 65 | Persistent State | All session data, gate progress, user levels, and week progress persist across sessions via Netlify Blob storage | Automatic | All users |

---

## D. Account & Settings

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 66 | Auto-Created Profile | System creates default user profile on first visit (no sign-up required) | Automatic | All users |

*No explicit account management, settings page, notifications preferences, or billing features exist in the current version.*

---

## E. Help & Support

*No help center, FAQ, chatbot, contact support, or feedback features exist in the current version.*

---

## F. Engagement & Retention Features

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 67 | Weekly Streak Tracking | See consecutive weeks of complete training (all 3 categories logged) as a motivational counter | Home `/` + History `/history` | All users |
| 68 | Gate Progression Gamification | Earn consecutive clean sessions (0/3 → 1/3 → 2/3 → 3/3) to unlock the next level | Log result + Home + Tree | All users |
| 69 | Level-Up Celebration | See animated glow-burst celebration modal when advancing to a new level | GatePassedModal overlay | All users |
| 70 | Positive-Only Feedback | All messaging uses encouraging language — no "FAIL" states, below-target shown as muted (not red) | App-wide | All users |
| 71 | Completion Percentage | See progress as a percentage (never a pass/fail binary) to reward partial effort | Log result + History | All users |
| 72 | Forward-Looking Language | Gap messaging uses phrasing like "1 rep to go" rather than "missed by 1" | Log result | All users |
| 73 | Visual Progress in Skill Tree | See a persistent visual map of advancement across all 3 categories with clear locked/open/passed states | Tree `/tree` | All users |
| 74 | Week Complete Celebration | See success message and emerald progress bar when all 3 sessions logged in a week | Home `/` | All users |
| 75 | Category Glow Effects | Cards glow with category-specific neon colors when completed, providing visual reward | Home `/` + Log | All users |

---

## G. Technical / Platform Features

| # | Feature | User Action | Location | Access |
|---|---------|-------------|----------|--------|
| 76 | PWA Installable | Add to home screen on iOS and Android for native-like experience | Browser install prompt | All users |
| 77 | Standalone Display Mode | App runs without browser chrome when installed as PWA | Installed PWA | All users |
| 78 | Mobile-First Layout | App constrained to 480px max-width, optimized for phone screens | App-wide | All users |
| 79 | Dark Theme (Tron) | Full dark UI with cyan neon accents, designed for low-light gym environments | App-wide | All users |
| 80 | Bottom Tab Navigation | Fixed bottom nav with 4 tabs: Home, Tree, Log, History | App-wide footer | All users |
| 81 | Sticky Header | App name "contrl" in sticky header with blur backdrop | App-wide header | All users |

---

## Total Feature Count: **81**

---

## Feature Map Summary

**contrl** is a mobile-first progressive web app for structured calisthenics training. It organizes bodyweight exercises into three independent tracks — Push, Pull, and Squat — each with five difficulty levels from Beginner to Expert. Users log workouts by checking off individual sets and entering their rep counts for each exercise. The app evaluates whether a session is "clean" (all targets met across all exercises) and tracks consecutive clean sessions toward a gate system: three consecutive clean sessions at your current level unlocks the next one, accompanied by a level-up celebration animation.

The home screen provides a weekly dashboard showing which of the three categories have been logged, overall progress toward a complete training week, and a streak counter for consecutive fully-completed weeks. The skill tree visualizes the entire progression path as a 3-column × 5-row grid where users can tap nodes to see required exercises and gate progress. Session history is grouped by week with expandable cards showing per-exercise completion breakdowns.

The app maintains a consistently positive tone — there are no failure states, red indicators, or harsh language. Below-target performance is shown in muted gray, completion is expressed as percentages, and messages focus on forward momentum ("Every rep counts. Keep showing up."). The entire experience is designed as a single-player progression game with persistence via cloud storage.

---

## Unclear / Needs Exploration

| # | Item | Why It's Unclear |
|---|------|-----------------|
| 1 | Offline behavior | PWA manifest exists and standalone display is configured, but no service worker (e.g., @serwist/next) is installed — unclear if the app works offline |
| 2 | Multi-device sync | Storage uses Netlify Blob with a single "default" user ID — unclear how data syncs if user accesses from multiple devices or browsers |
| 3 | Data reset / clear | No visible way for a user to reset their progress, delete sessions, or start over |
| 4 | Levels 4–5 exercises | Exercise database only covers Levels 1–3 (30 exercises). Levels 4 (Advanced) and 5 (Expert) have no exercises or gate criteria defined |
| 5 | Level 3 gate completion | When a user passes the Level 3 gate, they advance to Level 4 — but Level 4 has no exercises to display or log |
| 6 | Error recovery | If storage fails mid-save (e.g., network error during session log), there's no retry mechanism or error state visible to the user |
| 7 | Session editing / deletion | No way to edit or delete a previously logged session |
| 8 | Multiple sessions per category per week | The system marks a category as "done" after one session — unclear if logging a second Push session in the same week is tracked or affects anything |
| 9 | Authentication | No user authentication — the app assumes a single user per browser/device |
| 10 | Push notifications | No push notification system for reminders or streak warnings |

---

## Assumptions

1. The app is intended as a personal single-user tracker — no social features, sharing, or multi-user scenarios
2. Levels 4 and 5 are planned for future content updates but not yet populated with exercises
3. The positive-only UX philosophy (no red, no "FAIL") is a deliberate design decision, not an oversight
4. The 480px max-width constraint indicates the app is primarily designed for mobile phone usage
5. The MSW (Mock Service Worker) setup is for development only and does not affect production behavior
6. The existing `useUserData` hook and legacy API endpoints (`/user/data`, `/exercises/levels`) are from a previous version and may be deprecated in favor of the `useGameState` hook
