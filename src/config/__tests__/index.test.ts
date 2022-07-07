import { getConfig, setConfig } from '..';

describe('Config', () => {
  it('Should fail to retrieve configuration before init', () => {
    expect(getConfig).toThrow('Event streamer not initialized');
  });

  it('Should set and get configuration', () => {
    // arrange
    const newConfig = {
      host: 'localhost',
      onlyTesting: true
    };
    // act
    setConfig(newConfig);
    const config = getConfig();
    // assert
    expect(config).toMatchObject(newConfig);
  });
});
