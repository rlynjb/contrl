# API Module

Centralized API layer for making HTTP requests to backend services.

## Structure

```
src/api/
├── index.ts      # Main exports
├── client.ts     # HTTP client (fetch wrapper)
├── exercises.ts  # Exercise API + types
├── user.ts       # User API + types
└── README.md
```

## Usage

### Basic Import

```tsx
import { api } from '@/api'

// Exercise operations
const levels = await api.exercises.getWorkoutLevels()
const exercises = await api.exercises.getExercisesByLevel(1, 'Push')
const results = await api.exercises.searchExercises('pushup')

// User operations
const userData = await api.user.getUserData()
await api.user.updateUserData(newData)
const levels = await api.user.getCurrentLevels()
```

### Direct API Import

```tsx
import { exerciseApi, userApi } from '@/api'

const levels = await exerciseApi.getWorkoutLevels()
const user = await userApi.getUserData()
```

### Type Imports

```tsx
import type {
  // Exercise types
  BaseExercise,
  BaseExerciseSet,
  ExerciseWithMetadata,
  WorkoutLevel,
  WorkoutLevels,

  // User types
  UserData,
  CurrentUserLevels,
  WorkoutSession,
  WeekDay
} from '@/api'
```

## API Reference

### Exercise API

| Method | Description |
|--------|-------------|
| `getWorkoutLevels()` | Get all workout levels with exercises |
| `getExercisesByLevel(level, category?)` | Get exercises by level and optional category |
| `searchExercises(query)` | Search exercises by name or tags |
| `getExerciseLevel(name)` | Get level info for an exercise |
| `addExercise(exercise)` | Add a new exercise |

### User API

| Method | Description |
|--------|-------------|
| `getUserData()` | Get all user data |
| `updateUserData(data)` | Update user data |
| `getCurrentLevels()` | Get user's current levels |
| `updateLevel(category, level)` | Update a single level |

### Health Check

```tsx
const isHealthy = await api.healthCheck()
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for API endpoints | `''` (relative) |
| `NEXT_PUBLIC_API_TIMEOUT` | Request timeout in ms | `10000` |

## MSW Integration

In development, MSW intercepts API calls and returns mock data. See `src/mocks/` for handlers and mock data.

```tsx
// Enable MSW in .env.local
NEXT_PUBLIC_MSW_ENABLED=true
```
