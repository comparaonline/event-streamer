
import { setConfig } from './src/config';

// This function is executed once before all test suites.
export default () => {
  setConfig({
    host: 'fake-kafka:9092',
    consumer: {
      groupId: 'global-test-group'
    },
    onlyTesting: true,
    showDeprecationWarnings: false,
  });
};
