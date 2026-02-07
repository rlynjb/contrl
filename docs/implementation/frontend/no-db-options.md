# No-Database Storage Options - Implementation Guide

**Status**: 📋 **REFERENCE**  
**Date**: February 1, 2026  
**Context**: Single-user fitness tracking without database dependency

## Overview

This document outlines storage options for persisting user progress data (current levels, completed workouts, progress tracking) without requiring a database. Designed for single-user applications where simplicity and local development experience are prioritized.

---

## 🎯 Core Requirements

The application needs to store:

- **Current Levels**: User's current level per category (Push, Pull, Squat)
- **Completed Workouts**: Historical workout sessions with exercises, sets, reps, notes
- **Level Progress**: Tracking toward level-up requirements (reps completed, workouts done)
- **User Preferences**: Settings and configurations

**Key Constraints**:

- Single user (no multi-user support needed)
- Should work in local development
- Should work when deployed to Netlify
- No external database infrastructure

---

## 📊 Storage Options Comparison

| Option                | Local Dev | Netlify Deploy | Persistence              | Complexity            | Best For                 |
| --------------------- | --------- | -------------- | ------------------------ | --------------------- | ------------------------ |
| **localStorage**      | ✅        | ✅             | Browser only             | ⭐ Simple             | Production MVP           |
| **JSON + API Routes** | ✅        | ❌             | Filesystem (dev only)    | ⭐⭐ Medium           | Local development        |
| **Netlify Blobs**     | ❌        | ✅             | Server-side              | ⭐⭐⭐ Complex        | Production with backup   |
| **IndexedDB**         | ✅        | ✅             | Browser (larger storage) | ⭐⭐ Medium           | Large datasets           |
| **Git-Based**         | ✅        | ✅             | GitHub repo              | ⭐⭐⭐⭐ Very Complex | Version history tracking |

---

## Option 1: localStorage (Recommended for MVP)

### Overview

Store all user data in browser's localStorage API. Simple, reliable, works everywhere.

### Implementation

#### File Structure

```
src/lib/
└── storage/
    └── local-storage-service.ts    # NEW: localStorage wrapper
```

#### Code Example

```typescript
// src/lib/storage/local-storage-service.ts

export interface UserProgressData {
  currentLevels: {
    Push: number;
    Pull: number;
    Squat: number;
  };
  completedWorkouts: CompletedWorkout[];
  levelProgress: Record<string, LevelProgressData>;
  lastUpdated: string;
}

export class LocalStorageService {
  private static STORAGE_KEY = "calistheniq_user_progress";

  // Read all user data
  static load(): UserProgressData | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
      return null;
    }
  }

  // Save all user data
  static save(data: UserProgressData): void {
    try {
      data.lastUpdated = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
      throw error;
    }
  }

  // Clear all data
  static clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // Export data as JSON (for backup)
  static export(): string {
    const data = this.load();
    return JSON.stringify(data, null, 2);
  }

  // Import data from JSON
  static import(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      this.save(data);
    } catch (error) {
      console.error("Failed to import data:", error);
      throw error;
    }
  }
}
```

#### Integration with Data Service

```typescript
// src/lib/data-service/user-progress-service.ts

import { LocalStorageService } from "@/lib/storage/local-storage-service";

export class UserProgressService {
  static async getCurrentLevels(): Promise<Record<string, number>> {
    const data = LocalStorageService.load();
    return data?.currentLevels || { Push: 0, Pull: 0, Squat: 0 };
  }

  static async updateUserLevel(
    category: string,
    level: number,
  ): Promise<boolean> {
    const data = LocalStorageService.load() || this.getDefaultData();
    data.currentLevels[category] = level;
    LocalStorageService.save(data);
    return true;
  }

  static async logWorkout(workout: CompletedWorkout): Promise<boolean> {
    const data = LocalStorageService.load() || this.getDefaultData();
    data.completedWorkouts.push(workout);

    // Check for level-up
    this.checkAndUpdateLevels(data, workout);

    LocalStorageService.save(data);
    return true;
  }

  private static getDefaultData(): UserProgressData {
    return {
      currentLevels: { Push: 0, Pull: 0, Squat: 0 },
      completedWorkouts: [],
      levelProgress: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}
```

### Advantages

- ✅ **Zero configuration** - Works immediately
- ✅ **Fast** - Synchronous reads, instant UI updates
- ✅ **Works everywhere** - Local dev and production
- ✅ **No server costs** - Purely client-side
- ✅ **Privacy** - Data stays on user's device
- ✅ **Simple debugging** - DevTools → Application → Local Storage

### Limitations

- ❌ **Browser-specific** - Lost if browser data cleared
- ❌ **Single device** - Can't sync across devices
- ❌ **5-10MB limit** - Enough for years of workout data
- ❌ **No automatic backup** - User must manually export

### Mitigation: Export/Import Feature

Add UI buttons for data portability:

```typescript
// Component for backup/restore
function DataManagement() {
  const handleExport = () => {
    const data = LocalStorageService.export()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `calistheniq-backup-${Date.now()}.json`
    a.click()
  }

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      LocalStorageService.import(e.target?.result as string)
      alert('Data imported successfully!')
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <button onClick={handleExport}>Export Progress</button>
      <input type="file" accept=".json" onChange={(e) => handleImport(e.target.files[0])} />
    </div>
  )
}
```

---

## Option 2: JSON File + Next.js API Routes

### Overview

Store data in JSON file on filesystem. Works for local development but **NOT on Netlify** (read-only filesystem).

### Use Case

Perfect for local development and manual testing. Provides easy inspection of data structure.

### Implementation

#### File Structure

```
data/
└── user-progress.json              # Mutable user data
src/app/api/
└── progress/
    └── route.ts                    # Next.js API route
```

#### API Route Implementation

```typescript
// src/app/api/progress/route.ts

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "user-progress.json");

// Initialize data directory
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

// GET /api/progress - Read user progress
export async function GET() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    // File doesn't exist - return defaults
    const defaultData = {
      currentLevels: { Push: 0, Pull: 0, Squat: 0 },
      completedWorkouts: [],
      levelProgress: {},
      lastUpdated: new Date().toISOString(),
    };
    return NextResponse.json(defaultData);
  }
}

// POST /api/progress - Write user progress
export async function POST(request: NextRequest) {
  try {
    await ensureDataDir();
    const data = await request.json();
    data.lastUpdated = new Date().toISOString();

    // Write with pretty formatting for readability
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ success: true, timestamp: data.lastUpdated });
  } catch (error) {
    console.error("Failed to save progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 },
    );
  }
}

// DELETE /api/progress - Clear user progress
export async function DELETE() {
  try {
    await fs.unlink(DATA_FILE);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: true }); // Already deleted
  }
}
```

#### Data Service Integration

```typescript
// src/lib/data-service/user-progress-service.ts

export class UserProgressService {
  private static API_URL = "/api/progress";

  static async getCurrentLevels(): Promise<Record<string, number>> {
    const response = await fetch(this.API_URL);
    const data = await response.json();
    return data.currentLevels;
  }

  static async updateUserLevel(
    category: string,
    level: number,
  ): Promise<boolean> {
    // Read current data
    const response = await fetch(this.API_URL);
    const data = await response.json();

    // Update
    data.currentLevels[category] = level;

    // Write back
    await fetch(this.API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    return true;
  }
}
```

### Advantages

- ✅ **Easy inspection** - Open JSON file in any editor
- ✅ **Version control** - Can track changes in git (optional)
- ✅ **Portable** - Easy to backup (copy file)
- ✅ **Survives browser resets** - Data on filesystem
- ✅ **Great for local dev** - Easy debugging

### Limitations

- ❌ **Local only** - Does NOT work on Netlify deployment
- ❌ **Serverless incompatible** - Read-only filesystem in Lambda
- ❌ **Requires server** - Must run `npm run dev`

### .gitignore Configuration

```bash
# .gitignore

# Don't commit user progress (personal data)
data/user-progress.json

# Keep directory structure
!data/.gitkeep
```

---

## Option 3: Netlify Blobs (Server-Side Storage)

### Overview

Netlify's built-in key-value storage for serverless functions. Persistent, scalable, works in production.

### Setup

```bash
npm install @netlify/blobs
```

### Implementation

#### Netlify Function

```typescript
// netlify/functions/progress.ts

import { getStore } from "@netlify/blobs";

export default async (req: Request) => {
  const store = getStore("user-progress");

  // GET - Read progress
  if (req.method === "GET") {
    const data = await store.get("progress", { type: "json" });
    return new Response(JSON.stringify(data || {}), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST - Write progress
  if (req.method === "POST") {
    const data = await req.json();
    await store.set("progress", JSON.stringify(data));
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};
```

#### Data Service Integration

```typescript
// Same as JSON file approach, but endpoint changes:
private static API_URL = '/.netlify/functions/progress'
```

### Advantages

- ✅ **Production-ready** - Works on Netlify deployment
- ✅ **Persistent** - Survives function restarts
- ✅ **Server-side** - Can't be cleared by user
- ✅ **Scalable** - Handles concurrent requests

### Limitations

- ⚠️ **Costs money** - After free tier (1GB/month)
- ⚠️ **Netlify-specific** - Lock-in to platform
- ⚠️ **More complex** - Additional setup required
- ⚠️ **Not local-friendly** - Harder to develop locally

### Cost Estimate

- Free tier: 1GB storage, 1GB bandwidth/month
- Paid: $0.10/GB storage, $0.10/GB bandwidth
- For single user: ~1MB data = **FREE**

**Documentation**: https://docs.netlify.com/blobs/overview/

---

## Option 4: IndexedDB (Browser Database)

### Overview

Browser's built-in database for larger datasets. More powerful than localStorage.

### When to Use

- Need to store >5MB of data
- Want structured queries
- Need transaction support

### Implementation

```typescript
// Using Dexie.js (IndexedDB wrapper)
import Dexie from "dexie";

class CalistheniqDB extends Dexie {
  workouts: Dexie.Table<CompletedWorkout, number>;
  levels: Dexie.Table<LevelData, string>;

  constructor() {
    super("CalistheniqDB");
    this.version(1).stores({
      workouts: "++id, date, category",
      levels: "category",
    });
  }
}

const db = new CalistheniqDB();

// Query examples
await db.workouts.where("date").above(lastWeek).toArray();
await db.levels.get("Push");
```

### Advantages

- ✅ **Large storage** - Hundreds of MBs
- ✅ **Structured queries** - SQL-like operations
- ✅ **Indexed searches** - Fast lookups

### Limitations

- ❌ **More complex** - Steeper learning curve
- ❌ **Overkill** - For simple key-value storage
- ❌ **Browser-specific** - Same limitations as localStorage

---

## Hybrid Approach: Best of Both Worlds

Combine localStorage for fast access + optional sync to server for backup.

### Strategy

```typescript
export class HybridStorageService {
  // Primary: Fast localStorage access
  private static storage = LocalStorageService;

  // Secondary: Optional cloud backup
  private static cloudBackup = async (data: UserProgressData) => {
    if (navigator.onLine) {
      // Silently sync to Netlify Blobs in background
      try {
        await fetch("/.netlify/functions/progress", {
          method: "POST",
          body: JSON.stringify(data),
        });
      } catch (error) {
        console.warn("Cloud backup failed (offline?)", error);
      }
    }
  };

  static async save(data: UserProgressData) {
    // Instant save to localStorage
    this.storage.save(data);

    // Background sync to cloud (non-blocking)
    this.cloudBackup(data).catch(() => {});
  }

  static async load(): Promise<UserProgressData> {
    // Always read from localStorage (instant)
    return this.storage.load();
  }
}
```

**Benefits**:

- ✅ Instant UI updates (localStorage)
- ✅ Durable backup (cloud)
- ✅ Works offline
- ✅ Syncs when online

---

## 🎯 Recommendation Matrix

### For Your Current Needs (Single-User Fitness Tracker)

**Phase 1: Local Development & Testing**
→ **Use: JSON File + API Routes**

- Easy to inspect progress
- Can manually edit test data
- Version control friendly

**Phase 2: Production MVP**
→ **Use: localStorage**

- Simplest deployment
- No server costs
- Add export/import for safety

**Phase 3: Future Enhancement (Optional)**
→ **Add: Netlify Blobs backup**

- Automatic cloud backup
- Multi-device sync possibility
- Peace of mind

---

## Implementation Checklist

### localStorage Setup (Recommended Start)

- [ ] Create `src/lib/storage/local-storage-service.ts`
- [ ] Define `UserProgressData` interface
- [ ] Implement load/save/clear methods
- [ ] Add export/import functionality
- [ ] Update `UserProgressService` to use localStorage
- [ ] Add backup/restore UI components
- [ ] Test browser clear scenarios

### JSON File Setup (Development)

- [ ] Create `data/` directory
- [ ] Add `data/user-progress.json` to .gitignore
- [ ] Create `src/app/api/progress/route.ts`
- [ ] Implement GET/POST/DELETE handlers
- [ ] Update `UserProgressService` API calls
- [ ] Test file creation and updates
- [ ] Document local-only limitation

### Netlify Blobs Setup (Production)

- [ ] Install `@netlify/blobs` package
- [ ] Create `netlify/functions/progress.ts`
- [ ] Configure Netlify Blobs store
- [ ] Update data service endpoint
- [ ] Test on Netlify deployment
- [ ] Monitor costs and usage
- [ ] Implement backup strategy

---

## Testing Scenarios

### localStorage

1. ✅ Save progress → Refresh page → Data persists
2. ✅ Clear browser data → Data lost (expected)
3. ✅ Export JSON → Import JSON → Data restored
4. ✅ Open DevTools → See data in localStorage

### JSON File (Local Dev)

1. ✅ Save progress → Check `data/user-progress.json` updated
2. ✅ Manually edit file → Refresh → Changes reflected
3. ✅ Stop server → Data persists
4. ✅ Copy file → Backup successful

### Netlify Blobs (Production)

1. ✅ Deploy to Netlify → Save progress → Check persistence
2. ✅ Refresh deployment → Data survives
3. ✅ Check Netlify dashboard → Monitor storage usage

---

## Migration Path

### Current State → localStorage

1. Remove database dependencies
2. Implement `LocalStorageService`
3. Update `UserProgressService`
4. Add export/import UI
5. Test all CRUD operations

### localStorage → Netlify Blobs (Later)

1. Install `@netlify/blobs`
2. Create Netlify function
3. Add config flag: `USE_CLOUD_BACKUP`
4. Implement hybrid approach
5. Add migration script for existing users

### localStorage → Database (Future)

1. Your data service layer already supports this!
2. Just flip feature flags:
   ```typescript
   USE_DATABASE_USER_PROGRESS: true;
   ```
3. Components unchanged (they use `dataService` abstraction)

---

## Related Documentation

- [Data Service Layer](./data-service-layer.md) - Unified data access interface
- [Type System](./type-system-data-modeling.md) - Data type definitions
- [Frontend Setup](./frontend-setup.md) - Application configuration

---

## Conclusion

**For single-user fitness tracking without database:**

1. **Start with localStorage** - Simplest, works everywhere
2. **Add export/import** - Safety net for users
3. **Consider JSON files** - Better local dev experience
4. **Upgrade to Blobs** - Only if you need cloud backup later

The beauty of your data service architecture is you can switch storage backends without changing a single component. Start simple, upgrade when needed.
