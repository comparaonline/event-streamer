import { getSubjectName, toKebabCase } from '..';

describe('subject naming', () => {
  it('toKebabCase converts various forms', () => {
    expect(toKebabCase('MyServiceName')).toBe('my-service-name');
    expect(toKebabCase('my_service name')).toBe('my-service-name');
  });
  it('getSubjectName kebab-cases both topic and schema name', () => {
    expect(getSubjectName('Some_Topic', 'MyEventName')).toBe('some-topic-my-event-name');
  });
});
