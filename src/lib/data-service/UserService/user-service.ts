/**
 * User Progress Service - Handles user progress and level tracking
 * 
 * Configure data source via: NEXT_PUBLIC_USER_PROGRESS_SOURCE
 * Options: 'mock' | 'localStorage'
 * Default: 'localStorage'
 */

import { LocalStorage, type UserData } from './localStorage'

type DataSource = 'mock' | 'localStorage'

export class UserService {
  private static get dataSource(): DataSource {
    const envSource = process.env.NEXT_PUBLIC_USER_PROGRESS_SOURCE as DataSource | undefined
    
    if (envSource) {
      return envSource
    }
    
    return 'localStorage'
  }

  static async getUserData(): Promise<UserData | null> {
    const dataSource = this.dataSource

    switch (dataSource) {
      case 'localStorage':
        return LocalStorage.getUserData()

      case 'mock':
      default:
        throw new Error(`getUserData not supported for ${dataSource}`)
    }
  }

  static updateUserData(data: UserData): void {
    const dataSource = this.dataSource

    switch (dataSource) {
      case 'localStorage':
        LocalStorage.updateUserData(data)
        break

      case 'mock':
      default:
        console.warn(`updateUserData not supported for ${dataSource}`)
    }
  }
}

