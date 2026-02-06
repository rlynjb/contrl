# Data Service Layer

A comprehensive data access layer that provides unified interface for data operations with seamless switching between mock data and production API endpoints.

## 📁 Folder Structure

```
src/lib/data-service/
├── index.ts                      # Main exports
├── config.ts                     # Configuration & feature flags
├── api-client.ts                 # HTTP client for API calls
├── data-service.ts               # Main unified service
├── exercise-service.ts           # Exercise data operations
├── user-progress-service.ts      # User progress operations
├── workout-plan-service.ts       # Workout plan operations
└── mock-data/                    # Mock data for development/fallback
    ├── index.ts                  # Mock data exports
    ├── CurrentLevel/             # User current level mock data
    ├── WeeklyProgress/           # Weekly progress mock data
    └── WorkoutLevels/            # Exercise levels mock data
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { dataService } from "@/lib/data-service";

// Get workout levels
const levels = await dataService.exercises.getWorkoutLevels();

// Get user progress
const userLevels = await dataService.userProgress.getCurrentLevels("user123");

// Check if using mock data
const isUsingMock = dataService.isUsingMockData();
```

### Direct Mock Data Access (if needed)

```typescript
// Direct access to mock data (fallback/testing)
import { workoutLevels } from "@/lib/data-service/mock-data/WorkoutLevels";
import { currentLevelData } from "@/lib/data-service/mock-data/CurrentLevel";
import { MOCK_weeklyWorkouts } from "@/lib/data-service/UserService/mocks/WeeklyProgress";
```

### With React Hooks

```typescript
import { useWorkoutLevels, useCurrentLevels } from "@/hooks/useDataService";

function MyComponent() {
  const { data: levels, loading, error } = useWorkoutLevels();
  const { data: userLevels, updateLevel } = useCurrentLevels("user123");

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {levels && <div>Exercise levels loaded!</div>}
    </div>
  );
}
```

## ⚙️ Configuration

### Environment Variables

Add to `.env.local`:

```bash
# Toggle data source
NEXT_PUBLIC_USE_MOCK_DATA=true                    # Force mock data usage

# API configuration
NEXT_PUBLIC_API_BASE_URL=https://your-api.com     # API base URL

# Feature flags for gradual rollout
NEXT_PUBLIC_USE_DATABASE_EXERCISES=false          # Use database for exercises
NEXT_PUBLIC_USE_DATABASE_USER_PROGRESS=false      # Use database for user progress
NEXT_PUBLIC_USE_DATABASE_WORKOUT_PLANS=false      # Use database for workouts
```

### Default Behavior

- **Development**: Uses mock data by default
- **Production**: Uses API with automatic fallback to mock data
- **Feature Flags**: Enable gradual migration per feature

## 📋 Available Services

### ExerciseService

```typescript
// Get all workout levels
const levels = await dataService.exercises.getWorkoutLevels();

// Get exercises by level/category
const exercises = await dataService.exercises.getExercisesByLevel(1, "Push");

// Search exercises
const results = await dataService.exercises.searchExercises("push up");
```

### UserProgressService

```typescript
// Get user's current levels
const levels = await dataService.userProgress.getCurrentLevels("user123");

// Update user level
const success = await dataService.userProgress.updateUserLevel(
  "Push",
  2,
  "user123"
);
```

### WorkoutPlanService

```typescript
// Get recommended workout
const workout = await dataService.workouts.getRecommendedWorkout(
  "user123",
  preferences
);

// Log workout session
const success = await dataService.workouts.logWorkoutSession(
  sessionData,
  "user123"
);
```

## 🔗 API Endpoints (Placeholder)

The following endpoints need implementation:

```
GET  /.netlify/functions/exercises/levels        # Get workout levels
GET  /.netlify/functions/exercises               # Get exercises (filtered)
GET  /.netlify/functions/exercises/search        # Search exercises
GET  /.netlify/functions/user/levels             # Get user levels
PUT  /.netlify/functions/user/levels             # Update user level
POST /.netlify/functions/workouts/recommend      # Get workout recommendation
POST /.netlify/functions/workouts/log            # Log workout session
GET  /.netlify/functions/health                  # Health check
```

## 🛡️ Error Handling

- **Automatic Fallbacks**: API failures automatically fall back to mock data
- **Error Logging**: All API errors are logged with warnings
- **Graceful Degradation**: Application continues working even if APIs fail
- **Type Safety**: Full TypeScript support with proper error types

## 🔄 Migration Strategy

1. **Start with Mock Data**: All services work with existing mock data
2. **Implement Endpoints**: Add netlify functions gradually
3. **Enable Feature Flags**: Turn on database integration per service
4. **Monitor & Iterate**: Watch error rates and performance

## 📊 Benefits

- ✅ **Seamless Transition** from mock to production data
- ✅ **Fault Tolerance** with automatic fallbacks
- ✅ **Feature Flag Control** for safe deployments
- ✅ **Consistent Interface** regardless of data source
- ✅ **Development Friendly** with mock data by default
- ✅ **Type Safe** with full TypeScript support

## 🔧 Development Tips

### Testing Different Data Sources

```typescript
// Force mock data in tests
process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";

// Test specific features
process.env.NEXT_PUBLIC_USE_DATABASE_EXERCISES = "true";
```

### Debugging

```typescript
// Check current configuration
console.log("Data Service Config:", dataService.getConfig());

// Check if using mock data
console.log("Using mock data:", dataService.isUsingMockData());

// Health check
const isHealthy = await dataService.healthCheck();
console.log("Service health:", isHealthy);
```

## 🚦 Next Steps

1. Implement netlify function endpoints one by one
2. Test each endpoint with feature flags enabled
3. Monitor error rates and fallback usage
4. Gradually migrate from mock to database data
5. Remove mock data dependencies when fully migrated
