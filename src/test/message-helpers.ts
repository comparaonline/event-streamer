import { Message } from 'kafka-node';

export const buildMessageEvent = (src: Message) => ({
  message: src, event: JSON.parse(src.value as string)
});
