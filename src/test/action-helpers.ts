import { KafkaInputEvent } from '../kafka';

type Performer = { perform: (event: KafkaInputEvent) => Promise<any> };
export const trackAction = (action: Performer) => {
  const original = action.perform;
  return (array: string[]) => {
    action.perform = jest.fn(async (event) => {
      await original(event);
      array.push(event.value);
    }) as any;
    action['restore'] = () => {
      action.perform = original;
      delete action['restore'];
    };
  };
};
