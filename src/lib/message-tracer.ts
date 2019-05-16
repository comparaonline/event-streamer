import * as opentracing from 'opentracing';
import { EventMessage } from '../kafka/interfaces/event-message';
import { FutureResult } from '../kafka/interfaces/future-result';

const DD_SERVICE_NAME = 'kafka.event.consume';
const APM_TYPE = 'KafkaEventConsume';

const logResult = (span: opentracing.Span) => <T>(value: T) => {
  span.finish();
  return value;
};
const logError = (span: opentracing.Span) => <T extends Error>(error: T) => {
  span.setTag(opentracing.Tags.ERROR, true);
  span.log({
    event: 'error',
    'error.object': error,
    message: error.message,
    stack: error.stack
  });
  span.finish();
  throw error;
};

export interface PromiseTracer {
  (data: EventMessage & FutureResult): EventMessage & FutureResult;
}

export const messageTracer = (projectName: string, topic: string): PromiseTracer => {
  return (data: EventMessage & FutureResult): EventMessage & FutureResult => {
    const tracer = opentracing.globalTracer();
    const span = tracer.startSpan(
      DD_SERVICE_NAME,
      {
        tags: {
          topic,
          type: APM_TYPE,
          'service.name': `${projectName}-events`,
          'resource.name': data.event.code
        }
      }
    );
    return {
      ...data,
      result: data.result
        .then(logResult(span))
        .catch(logError(span))
    };
  };
};
