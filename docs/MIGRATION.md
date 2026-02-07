# Data Source Migration Guide

This guide explains how to switch between Mock (MSW) and Netlify Blob data sources.

## Overview

| Mode | Data Source | Use Case |
|------|-------------|----------|
| **MSW (Mock)** | In-memory, `src/mocks/data/*` | Local development, testing, offline |
| **Netlify Blob** | Netlify edge storage | Production, staging, persistence |

---

## Mock → Netlify Blob

Switch from MSW mock data to Netlify Blob storage.

### 1. Update Environment

Edit `.env.local`:

```bash
NEXT_PUBLIC_MSW_ENABLED=false
```

### 2. Start Netlify Dev Server

```bash
netlify dev
```

### 3. Seed the Blob Store

```bash
# Local development
curl -X POST http://localhost:8888/seed

# Production (after deploy)
curl -X POST https://your-site.netlify.app/seed
```

### 4. Verify Data

```bash
# Check user data
curl http://localhost:8888/user/data

# Check exercise levels
curl http://localhost:8888/exercises/levels
```

### 5. Refresh App

Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

---

## Netlify Blob → Mock

Switch from Netlify Blob back to MSW mock data.

### 1. Update Environment

Edit `.env.local`:

```bash
NEXT_PUBLIC_MSW_ENABLED=true
```

### 2. Restart Dev Server

```bash
# Stop current server (Ctrl+C)
# Start with npm
npm run dev
```

### 3. Verify MSW is Active

Check browser console for:
```
[MSW] Mock Service Worker started
```

### 4. Refresh App

Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

---

## Data Source Comparison

### MSW (Mock)

**Pros:**
- No network latency
- Works offline
- Instant data resets
- Easy to modify test data

**Cons:**
- Data resets on page refresh
- Not shared between sessions
- Doesn't test real API behavior

**Files:**
- `src/mocks/data/user.ts` - User levels, weekly workouts
- `src/mocks/data/exercises.ts` - Exercise database
- `src/mocks/handlers.ts` - API route handlers

### Netlify Blob

**Pros:**
- Persistent storage
- Shared across sessions
- Real API behavior
- Production-ready

**Cons:**
- Requires Netlify CLI or deployment
- Network latency
- Must seed data initially

**Files:**
- `netlify/functions/user-data.ts` - User data endpoints
- `netlify/functions/exercises*.ts` - Exercise endpoints
- `netlify/functions/seed.ts` - Database seeding
- `netlify/functions/core/infrastructure/blob/` - Blob utilities

---

## Troubleshooting

### Data not showing after switching to Blob

1. Verify MSW is disabled:
   ```bash
   grep MSW_ENABLED .env.local
   # Should show: NEXT_PUBLIC_MSW_ENABLED=false
   ```

2. Seed the database:
   ```bash
   curl -X POST http://localhost:8888/seed
   ```

3. Hard refresh browser

### MSW not intercepting requests

1. Verify MSW is enabled:
   ```bash
   grep MSW_ENABLED .env.local
   # Should show: NEXT_PUBLIC_MSW_ENABLED=true
   ```

2. Check browser console for `[MSW] Mock Service Worker started`

3. Restart dev server (not `netlify dev`)

### 404 errors on API calls

- **Using MSW:** Run `npm run dev` (not `netlify dev`)
- **Using Blob:** Run `netlify dev` (not `npm run dev`)

### Stale data after switching modes

1. Clear browser cache
2. Hard refresh: `Cmd+Shift+R` / `Ctrl+Shift+R`
3. Check Network tab for correct endpoints

---

---

## Netlify Blob → Mock Files

Export data from Netlify Blob to `src/mocks/data/*` files for persistent mock data.

### From Local Netlify Dev

```bash
# Start netlify dev first
netlify dev

# In another terminal, sync the data
npm run sync:from-blob
```

### From Production

```bash
npm run sync:from-prod https://your-site.netlify.app
```

### What Gets Exported

- `src/mocks/data/user.ts` - User levels, weekly workouts

### After Syncing

1. Review changes: `git diff src/mocks/data/`
2. Restart dev server
3. Commit if desired: `git add src/mocks/data/ && git commit -m "sync mock data"`

---

## Quick Reference

| Task | Command |
|------|---------|
| Enable MSW | `NEXT_PUBLIC_MSW_ENABLED=true` in `.env.local` |
| Disable MSW | `NEXT_PUBLIC_MSW_ENABLED=false` in `.env.local` |
| Run with MSW | `npm run dev` |
| Run with Blob | `netlify dev` |
| Seed local Blob | `curl -X POST http://localhost:8888/seed` |
| Seed production | `curl -X POST https://your-site.netlify.app/seed` |
| Sync Blob → Mock | `npm run sync:from-blob` |
| Sync Prod → Mock | `npm run sync:from-prod https://your-site.netlify.app` |
| Check user data | `curl http://localhost:8888/user/data` |
| Reset mock data | Refresh page (MSW reloads from `src/mocks/data/*`) |
| Reset Blob data | Re-run seed endpoint |
