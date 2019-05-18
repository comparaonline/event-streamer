export const testMessage = (value = 'Test Message') => ({
  topic: 'testTopic',
  value: JSON.stringify({
    value,
    code: 'TestInputEvent'
  }),
  partition: 0
});
