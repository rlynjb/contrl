/**
 * CalisthenIQ - AI-Powered Calisthenics Coach
 * 
 * Main entry point for the application
 */

import { CoachingAgent } from './agents/CoachingAgent';

/**
 * Main application class
 */
export class CalisthenIQ {
  private coachingAgent: CoachingAgent;

  constructor() {
    this.coachingAgent = new CoachingAgent();
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    console.log('🏋️  CalisthenIQ - AI-Powered Calisthenics Coach');
    console.log('Initializing...');
    await this.coachingAgent.initialize();
    console.log('✓ Ready to coach!\n');
  }

  /**
   * Start the coaching session
   */
  public async start(): Promise<void> {
    await this.coachingAgent.startSession();
  }
}

/**
 * Run the application if this is the main module
 */
if (require.main === module) {
  const app = new CalisthenIQ();
  app.initialize()
    .then(() => app.start())
    .catch((error: Error) => {
      console.error('Error starting CalisthenIQ:', error.message);
      process.exit(1);
    });
}

export default CalisthenIQ;
