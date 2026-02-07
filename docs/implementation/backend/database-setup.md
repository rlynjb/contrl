# Database Setup Guide - CalisthenIQ

Following Phase 1, Week 1-2 of the roadmap: Database Schema Design & Implementation

## Step 1: Set up Neon PostgreSQL Database

### 1.1 Create Neon Account & Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Sign up or log in
3. Create a new project named "calistheniq"
4. Select region (choose closest to your users)
5. Note down the connection string

### 1.2 Environment Variables Setup

Create or update `.env.local`:

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@hostname:5432/database?sslmode=require"

# OpenAI Configuration (for Phase 1 Week 3-4)
OPENAI_API_KEY="your-openai-api-key"

# Netlify Functions (for Phase 1 Week 3-4)
NETLIFY_SITE_ID="your-site-id"
```

### 1.3 Install Database Dependencies

```bash
# Core database dependencies
npm install @neondatabase/serverless tsx

# Note: We're using the Neon serverless driver directly
# which provides excellent TypeScript support and performance
```

## Step 2: Database Schema Creation

### 2.1 Create Database Schema File

Create `netlify/functions/core/infrastructure/database/schema.sql`:

```sql
-- Copy the complete schema from docs/database-schema-design.md
-- This includes all tables, indexes, and constraints
```

### 2.2 Create Database Connection

Create `netlify/functions/core/infrastructure/database/connection.ts`:

```typescript
import { neon } from "@neondatabase/serverless";

// Check for DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(process.env.DATABASE_URL);

export { sql };

// Connection test function
export async function testConnection() {
  try {
    const result = await sql`SELECT version()`;
    console.log("✅ Database connected successfully");
    console.log("PostgreSQL version:", result[0].version);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}
```

### 2.3 Create Migration Runner

Create `netlify/functions/core/infrastructure/database/migrate.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "./connection";

export async function runMigrations() {
  try {
    console.log("🚀 Running database migrations...");

    // Read and execute schema
    const schemaPath = join(__dirname, "schema.sql");
    const schemaSQL = readFileSync(schemaPath, "utf8");

    // Split by semicolon and execute each statement
    const statements = schemaSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await sql([statement] as any);
    }

    console.log("✅ Database migrations completed successfully");
    return true;
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return false;
  }
}
```

## Step 3: Data Migration Scripts

### 3.1 Create Exercise Data Migration

Create `netlify/functions/core/infrastructure/database/seed-exercises.ts`:

```typescript
import { sql } from "./connection";
import { allExercises } from "../../../../../src/lib/data-service/mock-data/WorkoutLevels/mock";

export async function seedExercises() {
  try {
    console.log("🌱 Seeding exercise data...");

    // First, get level and category mappings
    const levels =
      await sql`SELECT id, name, level_order FROM workout_levels ORDER BY level_order`;
    const categories = await sql`SELECT id, name FROM exercise_categories`;

    const levelMap = Object.fromEntries(
      levels.map((l) => [l.level_order, l.id]),
    );
    const categoryMap = Object.fromEntries(
      categories.map((c) => [c.name, c.id]),
    );

    // Insert exercises
    for (const exercise of allExercises) {
      await sql`
        INSERT INTO exercises (
          id, name, level_id, category_id,
          default_sets, default_tempo, default_rest_seconds,
          default_equipment, default_notes, tags
        ) VALUES (
          ${exercise.id},
          ${exercise.name},
          ${levelMap[exercise.level]},
          ${categoryMap[exercise.category]},
          ${JSON.stringify(exercise.sets)},
          ${exercise.tempo || null},
          ${exercise.rest || null},
          ${exercise.equipment || null},
          ${exercise.notes || null},
          ${exercise.tags}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          default_sets = EXCLUDED.default_sets,
          default_tempo = EXCLUDED.default_tempo,
          default_rest_seconds = EXCLUDED.default_rest_seconds,
          default_equipment = EXCLUDED.default_equipment,
          default_notes = EXCLUDED.default_notes,
          updated_at = NOW()
      `;
    }

    console.log(`✅ Seeded ${allExercises.length} exercises successfully`);
    return true;
  } catch (error) {
    console.error("❌ Exercise seeding failed:", error);
    return false;
  }
}
```

### 3.2 Create User Progress Migration

Create `netlify/functions/core/infrastructure/database/seed-user-progress.ts`:

```typescript
import { sql } from "./connection";
import { MOCK_CurrentUserLevel } from "../../../../../src/lib/data-service/mock-data/CurrentLevel/mock";

export async function seedUserProgress() {
  try {
    console.log("🌱 Seeding user progress data...");

    // Create a test user
    const [user] = await sql`
      INSERT INTO users (email, name)
      VALUES ('test@example.com', 'Test User')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    // Get categories and levels
    const categories = await sql`SELECT id, name FROM exercise_categories`;
    const levels =
      await sql`SELECT id, level_order FROM workout_levels ORDER BY level_order`;

    const categoryMap = Object.fromEntries(
      categories.map((c) => [c.name, c.id]),
    );
    const levelMap = Object.fromEntries(
      levels.map((l) => [l.level_order, l.id]),
    );

    // Insert user current levels
    for (const [category, level] of Object.entries(MOCK_CurrentUserLevel)) {
      await sql`
        INSERT INTO user_current_levels (user_id, category_id, current_level, workout_level_id)
        VALUES (${user.id}, ${categoryMap[category]}, ${level}, ${levelMap[level]})
        ON CONFLICT (user_id, category_id) DO UPDATE SET
          current_level = EXCLUDED.current_level,
          workout_level_id = EXCLUDED.workout_level_id,
          updated_at = NOW()
      `;
    }

    console.log("✅ Seeded user progress successfully");
    return true;
  } catch (error) {
    console.error("❌ User progress seeding failed:", error);
    return false;
  }
}
```

### 3.3 Create Master Seed Script

Create `netlify/functions/core/infrastructure/database/seed.ts`:

```typescript
import { testConnection } from "./connection";
import { runMigrations } from "./migrate";
import { seedExercises } from "./seed-exercises";
import { seedUserProgress } from "./seed-user-progress";

async function main() {
  console.log("🚀 Starting database setup...");

  // Test connection
  const connected = await testConnection();
  if (!connected) {
    process.exit(1);
  }

  // Run migrations
  const migrated = await runMigrations();
  if (!migrated) {
    process.exit(1);
  }

  // Seed data
  await seedExercises();
  await seedUserProgress();

  console.log("🎉 Database setup completed successfully!");
}

main().catch(console.error);
```

## Step 4: Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "db:setup": "tsx netlify/functions/core/infrastructure/database/seed.ts",
    "db:migrate": "tsx netlify/functions/core/infrastructure/database/migrate.ts",
    "db:seed": "tsx netlify/functions/core/infrastructure/database/seed-exercises.ts && tsx netlify/functions/core/infrastructure/database/seed-user-progress.ts",
    "db:test": "tsx -e \"import('./netlify/functions/core/infrastructure/database/connection.js').then(m => m.testConnection())\"",
    "db:verify": "tsx netlify/functions/core/infrastructure/database/verify.ts"
  }
}
```

## Step 5: Execution Steps

### 5.1 Complete Setup Process

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables (update .env.local with your Neon connection string)

# 3. Test database connection
npm run db:test

# 4. Run complete database setup (migrations + seeding)
npm run db:setup
```

### 5.2 Verify Setup

```bash
# Test connection
npm run db:test

# You can also connect directly to verify data:
# Use Neon Console or any PostgreSQL client to check:
# - Tables were created
# - Exercises were inserted (~70 exercises)
# - User progress was set up
```

## Step 6: Next Steps (Week 2)

Once database setup is complete:

1. **Update Components**: Replace mock data imports with database queries
2. **Create Query Layer**: Build data access functions for each component
3. **Implement CRUD Operations**: Basic workout session management

Example of what comes next:

```typescript
// Replace this in components:
import { workoutLevels } from "@/lib/data-service/mock-data/WorkoutLevels";

// With this:
import { getWorkoutLevels } from "@/netlify/functions/core/infrastructure/database/queries";
const workoutLevels = await getWorkoutLevels(userId);
```

This aligns with your roadmap Phase 1, Week 1-2 timeline and sets you up perfectly for the backend integration in Week 2.
