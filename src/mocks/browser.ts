/**
 * MSW Browser Setup
 *
 * Configures the service worker for browser-based request interception.
 * Used during development in the browser.
 */

import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
