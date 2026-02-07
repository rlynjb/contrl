# Database Schema Design for CalisthenIQ

Based on the current data structures in `src/data/*` and `src/types/*`.

> 📚 **Learning Resource**: For a detailed explanation of the database infrastructure implementation, see [`docs/database-infrastructure.md`](./database-infrastructure.md) - a comprehensive guide with UML diagrams, design patterns, and language-agnostic concepts.

## Database Design Requirements Analysis

### Current Data Structures:

1. **Exercise Data** (`WorkoutLevels/mock.ts`):
   - 70+ exercises with metadata
   - Level progression (0-5: Foundation → Expert)
   - Categories (Push, Pull, Squat)
   - Sets, reps, tempo, rest, equipment, notes
   - Metadata: id, difficulty, tags

2. **User Progress** (`CurrentLevel/mock.ts`):
   - Current levels per category
   - Movement category tracking

3. **Workout Sessions** (`WeeklyProgress/mock.ts`):
   - Historical and planned workouts
   - Exercise combinations
   - Duration, categories, completion status

## Proposed Database Schema

```sql
-- ========================================
-- CORE TABLES
-- ========================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- EXERCISE LIBRARY TABLES
-- ========================================

-- Workout levels (Foundation, Beginner, Novice, etc.)
CREATE TABLE workout_levels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,          -- "Foundation", "Beginner", etc.
  description TEXT,                   -- Level description
  level_order INTEGER NOT NULL,       -- 0, 1, 2, 3, 4, 5
  UNIQUE(level_order)
);

-- Exercise categories
CREATE TABLE exercise_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL,          -- "Push", "Pull", "Squat"
  description TEXT
);

-- Master exercises table - your main exercise library
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  level_id INTEGER REFERENCES workout_levels(id),
  category_id INTEGER REFERENCES exercise_categories(id),

  -- Default exercise configuration
  default_sets JSONB NOT NULL,        -- [{"reps": 8}, {"reps": 6}, {"duration": 30}]
  default_tempo VARCHAR(20),           -- "3-2-3-1", "hold"
  default_rest_seconds INTEGER,       -- 90, 120
  default_equipment TEXT,             -- "Mini band", "Pull-up bar"
  default_notes TEXT,                 -- Exercise instructions/tips

  -- Exercise metadata
  tags TEXT[],                        -- ["wall", "band", "assisted"]

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- USER PROGRESS TABLES
-- ========================================

-- User's current level in each category
CREATE TABLE user_current_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES exercise_categories(id),
  current_level INTEGER NOT NULL,     -- 0, 1, 2, etc.
  workout_level_id INTEGER REFERENCES workout_levels(id), -- FK for data integrity

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, category_id),
  -- Ensure current_level matches workout_level.level_order
  CHECK (current_level >= 0 AND current_level <= 5)
);

-- User's personalized exercise configurations
-- This allows users to have custom sets/reps different from defaults
CREATE TABLE user_exercise_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,

  -- User's current working parameters (progressing toward defaults)
  current_sets JSONB,                 -- User's current working sets
  current_tempo VARCHAR(20),          -- User's current tempo
  current_rest_seconds INTEGER,       -- User's current rest
  current_notes TEXT,                 -- User's personal notes

  -- Progress tracking
  is_mastered BOOLEAN DEFAULT FALSE,  -- Has user mastered default parameters?
  mastered_at TIMESTAMP,              -- When they achieved the default

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, exercise_id)
);

-- ========================================
-- WORKOUT SESSION TABLES
-- ========================================

-- Workout sessions (both completed and planned)
CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  session_type VARCHAR(20) NOT NULL,  -- "completed", "planned", "today"
  session_date DATE NOT NULL,         -- When workout was/will be done
  scheduled_time TIME,                -- Planned time for workout

  duration_minutes INTEGER,           -- Actual or estimated duration
  level_id INTEGER REFERENCES workout_levels(id), -- Difficulty level

  -- Status and completion
  status VARCHAR(20) DEFAULT 'planned', -- "planned", "in_progress", "completed", "skipped"
  completed_at TIMESTAMP,

  notes TEXT,                         -- Session notes

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual exercises within a workout session
CREATE TABLE session_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id),

  exercise_order INTEGER NOT NULL,    -- Order within the session

  -- Planned parameters (copied from user config or defaults)
  planned_sets JSONB NOT NULL,       -- What was planned
  planned_tempo VARCHAR(20),
  planned_rest_seconds INTEGER,
  planned_notes TEXT,

  -- Actual performance (for completed workouts)
  actual_sets JSONB,                 -- What was actually done
  actual_tempo VARCHAR(20),
  actual_rest_seconds INTEGER,
  actual_notes TEXT,

  completed BOOLEAN DEFAULT FALSE,    -- Was this exercise completed?

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual set logging for detailed tracking
CREATE TABLE exercise_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id UUID REFERENCES session_exercises(id) ON DELETE CASCADE,

  set_number INTEGER NOT NULL,        -- 1, 2, 3, etc.

  -- Planned vs actual
  planned_reps INTEGER,
  actual_reps INTEGER,
  planned_duration_seconds INTEGER,
  actual_duration_seconds INTEGER,

  -- Set-specific data
  weight_kg DECIMAL(5,2),            -- For weighted exercises (future)
  rest_seconds INTEGER,              -- Actual rest taken after this set
  perceived_effort INTEGER,          -- 1-10 RPE scale
  notes TEXT,                        -- Set-specific notes

  completed_at TIMESTAMP,            -- When this set was finished

  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- WEEKLY PROGRESS TRACKING
-- ========================================

-- Daily workout summary for weekly view
CREATE TABLE daily_workout_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,

  -- Summary metrics
  total_exercises INTEGER DEFAULT 0,
  completed_exercises INTEGER DEFAULT 0,
  total_duration_minutes INTEGER DEFAULT 0,
  categories TEXT[],                  -- ["Push", "Pull"]

  -- Status
  is_completed BOOLEAN DEFAULT FALSE,
  is_today BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, workout_date)
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- User lookup indexes
CREATE INDEX idx_user_current_levels_user_id ON user_current_levels(user_id);
CREATE INDEX idx_user_exercise_configs_user_id ON user_exercise_configs(user_id);
CREATE INDEX idx_workout_sessions_user_id ON workout_sessions(user_id);
CREATE INDEX idx_daily_workout_summary_user_id ON daily_workout_summary(user_id);

-- Exercise lookup indexes
CREATE INDEX idx_exercises_level_category ON exercises(level_id, category_id);
CREATE INDEX idx_exercises_tags ON exercises USING GIN(tags);

-- Session lookup indexes
CREATE INDEX idx_workout_sessions_date_status ON workout_sessions(session_date, status);
CREATE INDEX idx_session_exercises_session_id ON session_exercises(session_id);

-- Weekly progress indexes
CREATE INDEX idx_daily_workout_summary_date ON daily_workout_summary(workout_date);
CREATE INDEX idx_daily_workout_summary_user_date ON daily_workout_summary(user_id, workout_date);
```

## Data Migration from Current Mock Data

### 1. Populate Core Data:

```sql
-- Insert workout levels
INSERT INTO workout_levels (name, description, level_order) VALUES
('Foundation', 'Stability, control, and knee-friendly movements', 0),
('Beginner', 'Basic bodyweight movements', 1),
('Novice', 'Intermediate progressions', 2),
('Intermediate', 'Standard calisthenics exercises', 3),
('Advanced', 'High-level skills and strength', 4),
('Expert', 'Elite calisthenics mastery', 5);

-- Insert categories
INSERT INTO exercise_categories (name, description) VALUES
('Push', 'Pushing movements - chest, shoulders, triceps'),
('Pull', 'Pulling movements - back, biceps'),
('Squat', 'Lower body movements - legs, glutes');
```

### 2. Migrate Exercise Data:

- Convert `allExercises` array from `WorkoutLevels/mock.ts`
- Map level names to level IDs
- Convert sets arrays to JSONB format
- Preserve all metadata (tags, equipment, etc.)

### 3. User Progress Migration:

- Convert `MOCK_CurrentUserLevel` to `user_current_levels` table
- Create default user for testing

## Key Features Supported:

### ✅ Database Capabilities:

1. **Master Exercise Library**: `exercises` table with all defaults
2. **Workout Session Management**: `workout_sessions` + `session_exercises` tables
3. **Progress Tracking**: Update sets, reps, tempo, rest, notes via `session_exercises` and `exercise_set_logs`
4. **User Progression**: `user_exercise_configs` for current vs default tracking

### ✅ Additional Capabilities:

- Detailed set-by-set logging
- Progress tracking toward exercise mastery
- Weekly summary views
- Flexible exercise configurations per user
- Historical workout analysis
- Future workout planning

### ✅ Architecture Benefits:

- Normalized design eliminates data duplication
- Flexible JSONB for variable set configurations
- Scalable for multiple users
- Supports both planned and completed workouts
- Detailed performance analytics
- Easy migration from current mock data

## Implementation Strategy

### Infrastructure Location - Architectural Alignment ✅

The database infrastructure is correctly positioned at `netlify/functions/core/infrastructure/database/` according to the clean architecture outlined in `docs/Architecture.md`:

```
netlify/functions/core/
├── orchestration/          # System coordination
├── agents/                 # AI decision making
├── tools/                  # Function calling interface
├── domain/                 # Business logic
└── infrastructure/         # External systems ✅
    └── database/          # Database layer ✅
```

#### Current Database File Structure:

```
netlify/functions/core/infrastructure/database/
├── connection.ts           # Neon serverless connection
├── migrate.ts             # Migration runner
├── queries.ts             # Query helper functions
├── schema.sql             # Complete database schema
├── seed-exercises.ts      # Exercise data seeding
├── seed-user-progress.ts  # User progress seeding
├── seed.ts               # Master seed script
├── test-queries.ts       # Query validation tests
└── verify.ts             # Database verification
```

#### Package.json Scripts:

```json
{
  "scripts": {
    "db:setup": "tsx netlify/functions/core/infrastructure/database/seed.ts",
    "db:migrate": "tsx netlify/functions/core/infrastructure/database/migrate.ts",
    "db:seed": "tsx netlify/functions/core/infrastructure/database/seed-exercises.ts && tsx netlify/functions/core/infrastructure/database/seed-user-progress.ts",
    "db:test": "tsx -e \"import('./netlify/functions/core/infrastructure/database/connection.js').then(m => m.testConnection())\"",
    "db:verify": "tsx netlify/functions/core/infrastructure/database/verify.ts",
    "db:test-queries": "tsx netlify/functions/core/infrastructure/database/test-queries.ts"
  }
}
```

### Phase 1: Foundation Setup

1. **Database Provisioning**: Neon PostgreSQL serverless database
2. **Schema Deployment**: Execute DDL scripts with proper error handling
3. **Data Migration**: Transform mock data to relational structure
4. **Connection Layer**: Serverless-optimized connection pooling
5. **Validation**: Comprehensive data integrity checks

### Phase 2: Application Integration

1. **Query Layer**: Repository pattern with typed interfaces
2. **Caching Strategy**: Redis for frequently accessed exercise data
3. **Migration Scripts**: Automated deployment pipeline
4. **Monitoring**: Database performance and query optimization
5. **Backup Strategy**: Point-in-time recovery and data retention

## Language-Agnostic Concepts

### Core Design Patterns

#### 1. **Domain-Driven Design (DDD)**

- **Aggregates**: User, Exercise Library, Workout Session
- **Value Objects**: Sets configuration (reps, duration, tempo)
- **Repositories**: Data access abstraction layer
- **Domain Services**: Exercise progression algorithms

#### 2. **Event Sourcing Concepts**

- **Workout Events**: Session started, exercise completed, level achieved
- **Audit Trail**: Complete history of user progress and modifications
- **State Reconstruction**: Rebuild user state from event history
- **Temporal Queries**: Progress analysis over time periods

#### 3. **CQRS (Command Query Responsibility Segregation)**

- **Commands**: Update user progress, log workout performance
- **Queries**: Retrieve exercise library, generate progress reports
- **Read Models**: Optimized views for weekly progress, exercise selection
- **Write Models**: Transactional consistency for user data updates

### Data Architecture Principles

#### 1. **Normalized vs Denormalized Trade-offs**

```
Normalized: Exercise definitions (single source of truth)
Denormalized: Session snapshots (performance at point-in-time)
JSONB Storage: Flexible exercise configurations
```

#### 2. **Temporal Data Management**

```
Historical Data: Immutable workout sessions and performance logs
Current State: User's present level and active configurations
Future Planning: Scheduled workouts and progression targets
```

#### 3. **Scalability Patterns**

```
Partitioning: Session data by date ranges
Sharding: User data by geographic regions (future)
Indexing: Composite indexes for common query patterns
```

### Universal Database Concepts Applied

#### 1. **ACID Properties Implementation**

- **Atomicity**: Workout session creation with exercises as single transaction
- **Consistency**: Foreign key constraints maintain data integrity
- **Isolation**: Concurrent user updates handled with proper locking
- **Durability**: PostgreSQL WAL ensures persistence

#### 2. **Data Integrity Mechanisms**

```sql
-- Referential Integrity
FOREIGN KEY CONSTRAINTS between related entities

-- Domain Constraints
CHECK constraints for level progression (0-5)
UNIQUE constraints for user-category combinations

-- Business Rules
Trigger functions for automatic timestamp updates
```

#### 3. **Query Optimization Strategies**

```
Covering Indexes: Include commonly selected columns
Partial Indexes: Filter frequently queried subsets
GIN Indexes: Full-text search on exercise tags
Materialized Views: Pre-computed weekly summaries
```

## Expected Outcomes

### Technical Outcomes

#### 1. **Performance Metrics**

- **Query Response**: Sub-100ms for exercise library retrieval
- **Concurrent Users**: Support 1000+ simultaneous connections
- **Data Volume**: Handle 1M+ workout sessions efficiently
- **Availability**: 99.9% uptime with serverless architecture

#### 2. **Data Quality Improvements**

- **Consistency**: Eliminate data duplication from mock files
- **Validation**: Automated constraint checking prevents invalid data
- **Audit Trail**: Complete history of all user interactions
- **Backup**: Point-in-time recovery with 7-day retention

#### 3. **Developer Experience**

- **Type Safety**: Generated types from database schema
- **Query Builder**: Type-safe database queries
- **Migration Tools**: Automated schema version management
- **Testing**: Isolated test databases for development

### Business Outcomes

#### 1. **User Experience Enhancements**

- **Personalization**: Individual progress tracking per exercise
- **Performance Analytics**: Detailed workout history and trends
- **Adaptive Difficulty**: Dynamic exercise selection based on progress
- **Goal Setting**: Custom targets with progress visualization

#### 2. **Operational Benefits**

- **Scalability**: Handle user growth without architectural changes
- **Maintainability**: Clear separation of concerns in data layer
- **Extensibility**: Add new exercise types without schema changes
- **Analytics**: Rich data for user behavior analysis

#### 3. **Product Capabilities**

- **Multi-User Support**: Foundation for user accounts and profiles
- **Workout Sharing**: Social features enabled by relational design
- **Progress Reports**: Comprehensive fitness journey documentation
- **AI Training Data**: Structured data for machine learning models

## Long-term Impact

### Technical Impact

#### 1. **Architecture Evolution**

```
Current: Monolithic Next.js with embedded data
Target: Microservices with dedicated data services
Future: Multi-tenant SaaS with advanced analytics
```

#### 2. **Data-Driven Features**

- **Predictive Analytics**: AI-powered exercise recommendations
- **Injury Prevention**: Pattern recognition from performance data
- **Social Features**: Community challenges and leaderboards
- **Coaching Insights**: Data-driven form corrections and tips

#### 3. **Platform Scalability**

- **API Economy**: Database as foundation for mobile apps, integrations
- **Real-time Features**: WebSocket connections for live workout tracking
- **Offline Support**: Local-first with eventual consistency
- **Global Distribution**: Multi-region database replication

### Business Impact

#### 1. **Market Positioning**

- **Competitive Advantage**: Sophisticated progress tracking vs basic fitness apps
- **User Retention**: Personalized experience increases engagement
- **Premium Features**: Advanced analytics justify subscription tiers
- **B2B Opportunities**: White-label platform for fitness professionals

#### 2. **Growth Enablement**

- **User Acquisition**: Rich data enables targeted marketing
- **Feature Velocity**: Stable data foundation accelerates development
- **Partnership Integration**: API-first design enables third-party integrations
- **International Expansion**: Multi-language, multi-currency ready

#### 3. **Ecosystem Development**

- **Developer Platform**: Third-party app development on CalisthenIQ data
- **Wearable Integration**: Sync with fitness trackers and smart watches
- **Health Records**: Integration with medical and wellness platforms
- **Research Collaboration**: Anonymized data for fitness research studies

### Success Metrics

#### 1. **Technical KPIs**

```
Database Performance: <100ms average query time
System Reliability: 99.9% uptime
Data Accuracy: <0.1% constraint violations
Migration Success: Zero data loss during transitions
```

#### 2. **User Engagement KPIs**

```
Progress Tracking: 80%+ users log workouts regularly
Feature Adoption: 90%+ use personalized exercise configs
Retention Rate: 70%+ monthly active users
User Satisfaction: 4.5+ star rating on data accuracy
```

#### 3. **Business KPIs**

```
Development Velocity: 50% faster feature delivery
Operational Costs: 30% reduction through serverless architecture
Market Expansion: Enable 3+ new product verticals
Revenue Growth: Foundation for premium subscription features
```

## Next Steps:

### Immediate Database Setup:

1. Set up PostgreSQL/Neon database
2. Run schema creation scripts using correct infrastructure paths
3. Create data migration scripts from current mock data
4. Update data layer to use database instead of mock files
5. Implement database connection and query layers

### Architecture Development Path:

With the infrastructure layer properly positioned, continue building the clean architecture:

1. **Database Setup**: Continue with Neon database creation using the corrected paths
2. **Domain Layer**: Implement business logic in `netlify/functions/core/domain/`
3. **Tools Layer**: Create function calling tools in `netlify/functions/core/tools/`
4. **Agents Layer**: Develop AI agents in `netlify/functions/core/agents/`
5. **Integration**: Connect all layers through the orchestration layer

### Architectural Benefits Achieved:

- ✅ **Clean Separation**: Frontend (`src/`) and backend infrastructure (`netlify/functions/core/infrastructure/`) properly separated
- ✅ **Scalability**: Ready for domain logic, AI agents, and orchestration layer implementation
- ✅ **Maintainability**: Clear file organization following architectural patterns
- ✅ **Team Development**: Clear boundaries for different development workstreams
