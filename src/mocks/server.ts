/**
 * MSW Server Setup
 *
 * Configures request interception for Node.js environments.
 * Used during testing and server-side operations.
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
