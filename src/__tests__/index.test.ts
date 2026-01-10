import CalisthenIQ from '../index';

describe('CalisthenIQ', () => {
  let app: CalisthenIQ;

  beforeEach(() => {
    app = new CalisthenIQ();
  });

  it('should create an instance', () => {
    expect(app).toBeInstanceOf(CalisthenIQ);
  });

  it('should initialize successfully', async () => {
    await expect(app.initialize()).resolves.not.toThrow();
  });
});
