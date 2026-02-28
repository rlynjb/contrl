import type { WorkoutSession, GateProgress, WeekProgress, User } from '@/types'

/**
 * Domain-specific storage interface.
 * Phase 0–1: NetlifyBlobAdapter. Future: LocalStorage, SQLite, Neon Postgres.
 */
export interface StorageProvider {
  saveSession(session: WorkoutSession): Promise<void>
  getSessions(category?: string, level?: number): Promise<WorkoutSession[]>

  getGateProgress(level: number, category: string): Promise<GateProgress>
  updateGateProgress(gate: GateProgress): Promise<void>

  getWeekProgress(weekStart: string): Promise<WeekProgress>
  updateWeekProgress(week: WeekProgress): Promise<void>

  getUser(): Promise<User>
  updateUser(user: User): Promise<void>
}
