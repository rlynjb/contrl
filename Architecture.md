# CalisthenIQ Architecture

This document outlines the project directory structure and architectural layers for CalisthenIQ, an AI-powered multi-agent calisthenics coaching application.

## Architectural Principles

- **Clean Separation**: Clear boundaries between presentation, orchestration, domain logic, and infrastructure
- **Multi-Agent Design**: Four specialized agents with distinct responsibilities
- **Tool-Based Architecture**: Function calling for database operations and domain actions
- **State Machine Routing**: Deterministic agent selection based on session state
- **Schema Validation**: Structured JSON contracts for all agent outputs

## Project Directory Structure

```
calistheniq/
├── README.md
├── package.json
├── Architecture.md
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
│
├── .env.local.example
├── .gitignore
├── .eslintrc.json
│
├── public/
│   ├── favicon.ico
│   └── images/
│       └── exercises/
│
├── src/
│   ├── app/                           # Next.js App Router (Presentation Layer)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   │
│   │   ├── chat/
│   │   │   └── page.tsx               # Main chat interface
│   │   │
│   │   ├── workout/
│   │   │   └── page.tsx               # Workout card view
│   │   │
│   │   └── api/
│   │       └── health/
│   │           └── route.ts           # Health check endpoint
│   │
│   ├── components/                    # UI Components (Presentation Layer)
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── badge.tsx
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx      # Main chat component
│   │   │   ├── MessageBubble.tsx      # Individual message display
│   │   │   └── StreamingResponse.tsx  # Streaming response handler
│   │   │
│   │   ├── workout/
│   │   │   ├── WorkoutCard.tsx        # Workout plan display
│   │   │   ├── ExerciseItem.tsx       # Individual exercise component
│   │   │   ├── ProgressTracker.tsx    # Progress tracking UI
│   │   │   └── SafetyIndicator.tsx    # Pain/safety indicators
│   │   │
│   │   └── gamification/
│   │       ├── XPDisplay.tsx          # Experience points UI
│   │       ├── StreakCounter.tsx      # Streak tracking display
│   │       └── BadgesList.tsx         # Achievements display
│   │
│   ├── hooks/                         # React Hooks (Presentation Logic)
│   │   ├── useChat.ts                 # Chat state management
│   │   ├── useWorkout.ts              # Workout session state
│   │   └── useStreaming.ts            # Streaming response handling
│   │
│   ├── lib/                           # Shared Utilities
│   │   ├── utils.ts                   # General utilities
│   │   ├── cn.ts                      # Class name utilities
│   │   └── constants.ts               # App constants
│   │
│   └── types/                         # TypeScript Types
│       ├── index.ts                   # Shared types export
│       ├── agents.ts                  # Agent-related types
│       ├── workout.ts                 # Workout domain types
│       ├── user.ts                    # User profile types
│       └── api.ts                     # API response types
│
├── netlify/
│   └── functions/                     # Backend Brain/Hub (Serverless Functions)
│       │
│       ├── coach.ts                   # Main Orchestrator Entry Point
│       ├── coach_background.ts        # Background Processing (Optional)
│       │
│       ├── core/                      # Core Backend Logic
│       │   │
│       │   ├── orchestration/         # Orchestration Layer
│       │   │   ├── supervisor.ts      # Main supervisor/router
│       │   │   ├── state-machine.ts   # State machine logic
│       │   │   ├── session-manager.ts # Session state management
│       │   │   └── response-handler.ts # Response formatting & streaming
│       │   │
│       │   ├── agents/                # AI Agents Layer
│       │   │   ├── base/
│       │   │   │   ├── BaseAgent.ts   # Abstract base agent
│       │   │   │   └── agent-config.ts # Agent configurations
│       │   │   │
│       │   │   ├── intake-safety/
│       │   │   │   ├── IntakeSafetyAgent.ts
│       │   │   │   └── intake-prompts.ts
│       │   │   │
│       │   │   ├── program-designer/
│       │   │   │   ├── ProgramDesignerAgent.ts
│       │   │   │   └── program-prompts.ts
│       │   │   │
│       │   │   ├── technique-coach/
│       │   │   │   ├── TechniqueCoachAgent.ts
│       │   │   │   └── coaching-prompts.ts
│       │   │   │
│       │   │   └── gamification/
│       │   │       ├── GamificationAgent.ts
│       │   │       └── gamification-prompts.ts
│       │   │
│       │   ├── tools/                 # Function Calling Tools Layer
│       │   │   ├── index.ts           # Tool registry/exports
│       │   │   ├── profile-tools.ts   # save_profile, fetch_profile
│       │   │   ├── session-tools.ts   # create_session, fetch_last_sessions
│       │   │   ├── logging-tools.ts   # log_set, log_completion
│       │   │   ├── gamification-tools.ts # award_xp, update_streak
│       │   │   └── exercise-tools.ts  # exercise_library_lookup
│       │   │
│       │   ├── domain/                # Domain Logic Layer
│       │   │   ├── models/
│       │   │   │   ├── User.ts        # User domain model
│       │   │   │   ├── Session.ts     # Session domain model
│       │   │   │   ├── Exercise.ts    # Exercise domain model
│       │   │   │   ├── WorkoutPlan.ts # Workout plan model
│       │   │   │   └── Achievement.ts # Achievement model
│       │   │   │
│       │   │   ├── services/
│       │   │   │   ├── ProfileService.ts # User profile business logic
│       │   │   │   ├── SessionService.ts # Session management logic
│       │   │   │   ├── WorkoutService.ts # Workout planning logic
│       │   │   │   ├── SafetyService.ts  # Safety validation logic
│       │   │   │   └── ProgressService.ts # Progress tracking logic
│       │   │   │
│       │   │   ├── validators/
│       │   │   │   ├── schemas.ts     # Zod validation schemas
│       │   │   │   ├── workout-schema.ts # Workout plan validation
│       │   │   │   ├── profile-schema.ts # User profile validation
│       │   │   │   └── safety-schema.ts  # Safety constraint validation
│       │   │   │
│       │   │   └── repositories/
│       │   │       ├── BaseRepository.ts # Abstract repository
│       │   │       ├── UserRepository.ts # User data operations
│       │   │       ├── SessionRepository.ts # Session data operations
│       │   │       ├── ExerciseRepository.ts # Exercise library operations
│       │   │       └── AchievementRepository.ts # Achievement operations
│       │   │
│       │   └── infrastructure/        # Infrastructure Layer
│       │       ├── database/
│       │       │   ├── connection.ts  # Neon/Postgres connection
│       │       │   ├── migrations/    # Database schema migrations
│       │       │   │   ├── 001_initial.sql
│       │       │   │   ├── 002_sessions.sql
│       │       │   │   ├── 003_achievements.sql
│       │       │   │   └── 004_indexes.sql
│       │       │   └── queries/       # Pre-built SQL queries
│       │       │       ├── users.sql
│       │       │       ├── sessions.sql
│       │       │       └── achievements.sql
│       │       │
│       │       ├── openai/
│       │       │   ├── client.ts      # OpenAI client configuration
│       │       │   ├── agents-sdk.ts  # Agents SDK integration
│       │       │   └── streaming.ts   # Streaming response handling
│       │       │
│       │       ├── external/
│       │       │   └── netlify.ts     # Netlify-specific utilities
│       │       │
│       │       └── config/
│       │           ├── environment.ts # Environment variable handling
│       │           ├── logging.ts     # Logging configuration
│       │           └── constants.ts   # Backend constants
│       │
│       └── data/                      # Static Data & Resources
│           ├── exercises/
│           │   ├── exercise-library.json # Exercise database
│           │   ├── progressions.json     # Exercise progressions
│           │   └── equipment-mapping.json # Equipment categories
│           │
│           ├── prompts/
│           │   ├── system-prompts/       # System-level prompts
│           │   ├── agent-prompts/        # Agent-specific prompts
│           │   └── safety-prompts/       # Safety-related prompts
│           │
│           └── schemas/
│               ├── workout-output.json   # Workout plan JSON schema
│               ├── profile-output.json   # User profile JSON schema
│               └── session-output.json   # Session log JSON schema
│
├── docs/                              # Documentation
│   ├── api/
│   │   ├── endpoints.md               # API documentation
│   │   └── examples.md                # Usage examples
│   │
│   ├── agents/
│   │   ├── intake-safety.md           # Intake & Safety Agent docs
│   │   ├── program-designer.md        # Program Designer Agent docs
│   │   ├── technique-coach.md         # Technique Coach Agent docs
│   │   └── gamification.md            # Gamification Agent docs
│   │
│   └── deployment/
│       ├── netlify-setup.md           # Netlify deployment guide
│       ├── database-setup.md          # Database setup instructions
│       └── environment.md             # Environment configuration
│
└── tests/                             # Test Suite
    ├── unit/
    │   ├── agents/                    # Agent unit tests
    │   ├── tools/                     # Tool function tests
    │   ├── domain/                    # Domain logic tests
    │   └── components/                # UI component tests
    │
    ├── integration/
    │   ├── api/                       # API integration tests
    │   ├── database/                  # Database integration tests
    │   └── agents/                    # Agent integration tests
    │
    └── e2e/
        ├── user-flows/                # End-to-end user flows
        └── chat-scenarios/            # Chat interaction scenarios
```

## Layer Descriptions

### 1. Presentation Layer (`src/app`, `src/components`, `src/hooks`)

**Purpose**: User interface and interaction handling

- **App Router**: Next.js 14 App Router for routing and layouts
- **Components**: Reusable UI components following atomic design principles
- **Hooks**: React hooks for state management and side effects
- **Responsibilities**:
  - Render chat interface and workout cards
  - Handle user input and interactions
  - Manage client-side state
  - Stream responses from backend
  - Display workout progress and gamification elements

### 2. Orchestration Layer (`netlify/functions/core/orchestration/`)

**Purpose**: System coordination and flow control

- **Supervisor**: Main entry point that routes requests to appropriate agents
- **State Machine**: Determines which agent should handle the current session state
- **Session Manager**: Manages session lifecycle and state persistence
- **Response Handler**: Formats responses and handles streaming
- **Responsibilities**:
  - Route incoming requests to correct agents
  - Maintain session state across interactions
  - Enforce business rules and constraints
  - Handle response streaming and formatting

### 3. Agents Layer (`netlify/functions/core/agents/`)

**Purpose**: AI-powered decision making and conversation handling

Four specialized agents with distinct responsibilities:

#### A) Intake & Safety Agent

- Collects user profile and safety constraints
- Validates readiness for exercise
- Identifies red flags requiring professional consultation

#### B) Program Designer Agent

- Creates personalized workout plans
- Ensures equipment and time constraints are met
- Includes progressions and regressions

#### C) Technique Coach Agent

- Provides real-time coaching during workouts
- Monitors pain levels and adjusts exercises
- Offers form cues and modifications

#### D) Gamification Agent

- Awards experience points and tracks streaks
- Triggers achievement badges
- Suggests next session focus areas

### 4. Tools Layer (`netlify/functions/core/tools/`)

**Purpose**: Function calling interface for agents

- **Profile Tools**: User profile CRUD operations
- **Session Tools**: Workout session management
- **Logging Tools**: Exercise set and completion logging
- **Gamification Tools**: XP, streaks, and achievement management
- **Exercise Tools**: Exercise library lookups and filtering

### 5. Domain Layer (`netlify/functions/core/domain/`)

**Purpose**: Business logic and domain models

- **Models**: Core domain entities (User, Session, Exercise, etc.)
- **Services**: Business logic implementation
- **Validators**: Schema validation using Zod
- **Repositories**: Data access patterns and abstractions
- **Responsibilities**:
  - Define core business entities
  - Implement domain-specific logic
  - Validate data integrity
  - Abstract data access patterns

### 6. Infrastructure Layer (`netlify/functions/core/infrastructure/`)

**Purpose**: External system integration and technical implementation

- **Database**: Postgres/Neon connection and query management
- **OpenAI**: Agents SDK integration and streaming
- **External**: Third-party service integrations
- **Config**: Environment and system configuration
- **Responsibilities**:
  - Manage database connections and migrations
  - Handle OpenAI API communication
  - Configure external service integrations
  - Manage environment variables and secrets

### 7. Static Data & Resources (`netlify/functions/data/`)

**Purpose**: Static data and configuration

- **Exercise Library**: Comprehensive exercise database with tags
- **Prompts**: System and agent-specific prompt templates
- **Schemas**: JSON schemas for output validation
- **Responsibilities**:
  - Provide exercise metadata and progressions
  - Store prompt templates for agents
  - Define output structure contracts

## Key Architectural Benefits

### Clean Separation of Concerns

- **Presentation** handles UI/UX without business logic
- **Orchestration** manages flow without knowing agent internals
- **Agents** focus on AI decision-making without infrastructure concerns
- **Domain** contains pure business logic
- **Infrastructure** handles external systems

### Scalability & Maintainability

- Each layer can be modified independently
- New agents can be added without changing orchestration
- Tools can be extended without affecting agents
- Infrastructure can be swapped without domain changes

### Testing Strategy

- **Unit Tests**: Individual functions and components
- **Integration Tests**: Layer interactions
- **E2E Tests**: Complete user workflows
- **Agent Tests**: AI behavior validation

### Development Workflow

1. **Frontend Development**: Work on UI components independently
2. **Agent Development**: Develop and test agents with mock tools
3. **Integration Development**: Connect layers with proper error handling
4. **Infrastructure Setup**: Configure databases and external services

This architecture ensures that CalisthenIQ remains maintainable, testable, and scalable while providing clear boundaries between different system responsibilities.
