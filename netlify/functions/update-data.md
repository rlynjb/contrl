# Data Management Workflow

## Overview

This project uses the **Fixtures + Snapshots** pattern for managing data between development and production environments.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW DIAGRAM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐                                                          │
│   │  Mock Files  │  (Fixtures - Source of Truth)                            │
│   │  src/mocks/  │                                                          │
│   └──────┬───────┘                                                          │
│          │                                                                   │
│          │ seed                                                              │
│          ▼                                                                   │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│   │    LOCAL     │         │              │         │  PRODUCTION  │        │
│   │  Blob Store  │◄───────►│  backup.json │◄───────►│  Blob Store  │        │
│   │              │ export/ │  (Snapshot)  │ export/ │              │        │
│   └──────┬───────┘ import  └──────────────┘ import  └──────┬───────┘        │
│          │                                                  │                │
│          │                                                  │                │
│          ▼                                                  ▼                │
│   ┌──────────────┐                                  ┌──────────────┐        │
│   │  Local App   │                                  │  Prod App    │        │
│   │  :8888       │                                  │  .netlify.app│        │
│   └──────────────┘                                  └──────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `seed` | POST /api/seed | Push mock files (fixtures) to blob storage |
| `export` | GET /api/export | Read blob storage and output JSON |
| `import` | POST /api/import | Write JSON data to blob storage |

## Concepts

### Fixtures (Mock Files)
- **Location**: `src/mocks/data/`
- **Purpose**: Source of truth, version controlled
- **Contains**: Logic (date generation, computed values)
- **Used by**: `seed` function

### Snapshots (Exported Data)
- **Location**: `backup.json` (or any `.json` file)
- **Purpose**: Captured runtime state from blob storage
- **Contains**: Pure JSON data for review
- **Created by**: `export` function
- **Consumed by**: `import` function

### Blob Storage
- **Local**: `.netlify/blobs/` (emulated by Netlify CLI)
- **Production**: Netlify's cloud blob storage
- **Important**: Local and production are separate data stores

---

## Local Dev Setup

There are two ways to run the app locally. The URL you use for functions depends on which setup you choose.

### Option 1: `netlify dev` (port 8888)

Runs Next.js and Netlify Functions together. The `/api/*` redirects are active.

```bash
netlify dev
# Functions available at: http://localhost:8888/api/*
```

### Option 2: `npm run dev` + `netlify functions:serve` (port 9999)

Runs Next.js and functions separately. The `/api/*` redirects are **NOT** available — use `/.netlify/functions/*` directly.

```bash
npm run dev                              # Next.js on port 3000
netlify functions:serve --port 9999      # Functions on port 9999
# Functions available at: http://localhost:9999/.netlify/functions/*
```

| Setup | Function URL example |
|-------|---------------------|
| `netlify dev` | `http://localhost:8888/api/import` |
| `functions:serve --port 9999` | `http://localhost:9999/.netlify/functions/import` |

> The workflow examples below use Option 1 URLs. If using Option 2, replace accordingly.

---

## Workflows

### 1. Initialize Local Development

Seed mock data to local blob storage:

```bash
# Prerequisites:
# - NEXT_PUBLIC_MSW_ENABLED=false in .env.local
# - netlify dev running

curl -X POST http://localhost:8888/api/seed
```

### 2. Export Data to File

Save blob data to a JSON file:

```bash
# From local
curl http://localhost:8888/api/export > backup.json

# From production
curl https://your-site.netlify.app/api/export > backup.json
```

### 3. Sync: Pull Production → Local

Copy production data to your local environment:

```bash
# Step 1: Export from production
curl https://your-site.netlify.app/api/export > backup.json

# Step 2: Import to local
curl -X POST http://localhost:8888/api/import \
  -d @backup.json \
  -H "Content-Type: application/json"
```

### 4. Sync: Push Local → Production

Copy local data to production:

```bash
# Step 1: Export from local
curl http://localhost:8888/api/export > backup.json

# Step 2: Import to production
curl -X POST https://your-site.netlify.app/api/import \
  -d @backup.json \
  -H "Content-Type: application/json"
```

### 5. Update Mock Files from Production

When you want to update your fixtures with production data:

```bash
# Step 1: Export from production
curl https://your-site.netlify.app/api/export > backup.json

# Step 2: Review backup.json

# Step 3: Manually update src/mocks/data/ files based on backup.json
```

---

## Quick Reference

```bash
# Seed local blob from mock files
curl -X POST http://localhost:8888/api/seed

# Export local blob to file
curl http://localhost:8888/api/export > backup.json

# Import file to local blob
curl -X POST http://localhost:8888/api/import -d @backup.json -H "Content-Type: application/json"

# Export production blob to file
curl https://your-site.netlify.app/api/export > backup.json

# Import file to production blob
curl -X POST https://your-site.netlify.app/api/import -d @backup.json -H "Content-Type: application/json"
```

---

## Environment Separation

| Environment | Blob Location | URL |
|-------------|---------------|-----|
| Local | `.netlify/blobs/` | `http://localhost:8888` |
| Production | Netlify cloud | `https://your-site.netlify.app` |

**Important**: These are completely separate data stores. Changes in one do not affect the other unless you explicitly sync using export/import.
