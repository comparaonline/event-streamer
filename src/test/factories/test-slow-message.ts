export const testSlowMessage = (value = 'Slow Message', delay = 100) => ({
  topic: 'testTopic',
  value: JSON.stringify({
    value,
    delay,
    code: 'TestSlowInputEvent'
  }),
  partition: 0
});
