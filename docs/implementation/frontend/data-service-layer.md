# Data Service Layer

This document explains the data service layer implementation located in `src/lib/data-service/` that provides a unified interface for data access with the ability to switch between mock data and production API endpoints.

## Overview

The data service layer consists of several components in `src/lib/data-service/`:

- **Configuration** (`config.ts`) - Environment-based configuration
- **API Client** (`api-client.ts`) - HTTP client for backend communication
- **Service Classes** (`*-service.ts`) - Service classes for different data domains
- **Main Service** (`data-service.ts`) - Unified service interface
- **Index** (`index.ts`) - All exports
- **React Hooks** (`src/hooks/useDataService.ts`) - React integration hooks

## Configuration

### Environment Variables

Add these to your `.env.local` file to control data source behavior:

```bash
# Data source configuration
NEXT_PUBLIC_USE_MOCK_DATA=true                    # Force mock data usage
NEXT_PUBLIC_API_BASE_URL=https://your-api.com     # API base URL (optional)

# Feature flags for gradual rollout
NEXT_PUBLIC_USE_DATABASE_EXERCISES=false          # Use database for exercise data
NEXT_PUBLIC_USE_DATABASE_USER_PROGRESS=false      # Use database for user progress
NEXT_PUBLIC_USE_DATABASE_WORKOUT_PLANS=false      # Use database for workout plans
```

### Default Behavior

- **Development**: Uses mock data by default
- **Production**: Uses API endpoints with mock data fallback
- **Feature Flags**: Allow gradual migration from mock to database

## Usage Examples

### Basic Data Fetching

```typescript
import { dataService } from '@/lib/data-service'

// Get workout levels
const levels = await dataService.exercises.getWorkoutLevels()

// Get user's current levels
const userLevels = await dataService.userProgress.getCurrentLevels('user123')

// Search exercises
const exercises = await dataService.exercises.searchExercises('push up')
```

### Using React Hooks

```typescript
import { useWorkoutLevels, useCurrentLevels } from '@/hooks/useDataService'

function MyComponent() {
  const { data: levels, loading, error } = useWorkoutLevels()
  const { data: userLevels, updateLevel } = useCurrentLevels('user123')
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  
  return (
    <div>
      {/* Use levels and userLevels data */}
    </div>
  )
}
```

## Service Classes

### ExerciseService

- `getWorkoutLevels()` - Get all exercise levels
- `getExercisesByLevel(level, category?)` - Get exercises by level/category
- `searchExercises(query)` - Search exercises by name

### UserProgressService

- `getCurrentLevels(userId?)` - Get user's current levels
- `updateUserLevel(category, level, userId?)` - Update user level

### WorkoutPlanService

- `getRecommendedWorkout(userId?, preferences?)` - Get workout plan
- `logWorkoutSession(data, userId?)` - Log completed workout

## API Endpoints (TODO)

The following endpoints need to be implemented in netlify functions:

```
GET  /.netlify/functions/exercises/levels     # Get all workout levels
GET  /.netlify/functions/exercises            # Get exercises (with level/category params)
GET  /.netlify/functions/exercises/search     # Search exercises
GET  /.netlify/functions/user/levels          # Get user levels
PUT  /.netlify/functions/user/levels          # Update user level
POST /.netlify/functions/workouts/recommend   # Get recommended workout
POST /.netlify/functions/workouts/log         # Log workout session
GET  /.netlify/functions/health               # Health check
```

## Gradual Migration Strategy

1. **Start with mock data** - All features work with existing mock data
2. **Implement API endpoints** - Add netlify functions one by one
3. **Enable feature flags** - Turn on database integration per feature
4. **Monitor and fallback** - Automatic fallback to mock data if API fails

## Benefits

- **Seamless transition** from mock to real data
- **Fault tolerance** with automatic fallbacks
- **Feature flag control** for safe rollouts
- **Consistent API** regardless of data source
- **Development friendly** with mock data by default

## Next Steps

1. Gradually implement the netlify function endpoints
2. Test each endpoint with feature flags
3. Monitor error rates and performance
4. Fully migrate from mock to database data
