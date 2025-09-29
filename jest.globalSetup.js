// jest.globalSetup.js
const { setConfig } = require('./src/config');

module.exports = () => {
  // This ensures that the entire test suite runs in "offline" mode,
  // preventing any real Kafka connections during unit tests.
  setConfig({
    host: 'fake-kafka:9092',
    consumer: {
      groupId: 'global-test-group',
    },
    onlyTesting: true,
    showDeprecationWarnings: false,
  });
};
