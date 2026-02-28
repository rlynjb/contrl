import type { WorkoutSession, GateProgress, WeekProgress, User, Category } from '@/types'
import type { StorageProvider } from './provider'
import { apiClient } from '@/api/client'

/**
 * StorageProvider backed by Netlify Blob via the game-data Netlify Function.
 * Each domain concept is stored as a separate key in the blob store.
 */
export class NetlifyBlobAdapter implements StorageProvider {
  private async get<T>(key: string): Promise<T | null> {
    try {
      const res = await apiClient.get<T>('/game/data', { key })
      return res.data ?? null
    } catch {
      return null
    }
  }

  private async set(key: string, value: unknown): Promise<void> {
    await apiClient.put('/game/data', { key, value })
  }

  // ── Sessions ──────────────────────────────────────────────

  async saveSession(session: WorkoutSession): Promise<void> {
    const sessions = await this.getSessions()
    sessions.push(session)
    await this.set('sessions', sessions)
  }

  async getSessions(category?: string, level?: number): Promise<WorkoutSession[]> {
    const all = (await this.get<WorkoutSession[]>('sessions')) ?? []
    return all.filter(s => {
      if (category && s.category !== category) return false
      if (level !== undefined && s.level !== level) return false
      return true
    })
  }

  // ── Gate Progress ─────────────────────────────────────────

  async getGateProgress(level: number, category: string): Promise<GateProgress> {
    const all = (await this.get<Record<string, GateProgress>>('gate-progress')) ?? {}
    const key = `${category}:${level}`
    return all[key] ?? {
      level,
      category: category as Category,
      status: 'locked',
      consecutivePasses: 0,
    }
  }

  async updateGateProgress(gate: GateProgress): Promise<void> {
    const all = (await this.get<Record<string, GateProgress>>('gate-progress')) ?? {}
    const key = `${gate.category}:${gate.level}`
    all[key] = gate
    await this.set('gate-progress', all)
  }

  // ── Week Progress ─────────────────────────────────────────

  async getWeekProgress(weekStart: string): Promise<WeekProgress> {
    const all = (await this.get<Record<string, WeekProgress>>('week-progress')) ?? {}
    return all[weekStart] ?? {
      weekStart,
      sessionsCompleted: { push: false, pull: false, squat: false },
    }
  }

  async updateWeekProgress(week: WeekProgress): Promise<void> {
    const all = (await this.get<Record<string, WeekProgress>>('week-progress')) ?? {}
    all[week.weekStart] = week
    await this.set('week-progress', all)
  }

  // ── User ──────────────────────────────────────────────────

  async getUser(): Promise<User> {
    const user = await this.get<User>('user')
    return user ?? {
      id: 'default',
      levels: { push: 1, pull: 1, squat: 1 },
      createdAt: new Date().toISOString(),
    }
  }

  async updateUser(user: User): Promise<void> {
    await this.set('user', user)
  }
}
