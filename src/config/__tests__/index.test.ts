import { getConfig, setConfig } from '..';

describe('Config', () => {
  it('Should fail to retrieve configuration before init', () => {
    expect(getConfig).toThrow('Event streamer not initialized');
  });

  it('Should set and get configuration', () => {
    const newConfig = {
      host: 'localhost',
      onlyTesting: true
    };
    setConfig(newConfig);
    const config = getConfig();
    expect(config).toMatchObject(newConfig);
  });
});
