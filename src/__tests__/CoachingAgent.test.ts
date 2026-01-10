import { CoachingAgent } from '../agents/CoachingAgent';

describe('CoachingAgent', () => {
  let agent: CoachingAgent;

  beforeEach(() => {
    agent = new CoachingAgent();
  });

  it('should have a name', () => {
    expect(agent.name).toBe('CoachingAgent');
  });

  it('should initialize successfully', async () => {
    await expect(agent.initialize()).resolves.not.toThrow();
  });

  it('should start a session successfully', async () => {
    await agent.initialize();
    await expect(agent.startSession()).resolves.not.toThrow();
  });
});
