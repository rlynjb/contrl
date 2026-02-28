export type { StorageProvider } from './provider'
export { NetlifyBlobAdapter } from './netlify-blob'

import { NetlifyBlobAdapter } from './netlify-blob'
import type { StorageProvider } from './provider'

let _instance: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (!_instance) {
    _instance = new NetlifyBlobAdapter()
  }
  return _instance
}

export function setStorage(provider: StorageProvider): void {
  _instance = provider
}
