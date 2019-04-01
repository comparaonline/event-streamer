import * as opentracing from 'opentracing';

const gTracer = opentracing.globalTracer();
const APM_TYPE = 'KafkaEvent';

const startSpan = (
  eventName: string,
  projectName: string): opentracing.Span => {
  console.log(gTracer);
  return gTracer.startSpan(
    eventName,
    {
      tags: {
        type: APM_TYPE,
        'service.name': `${projectName}-events`
      }
    }
  );
};

const finishSpan = (span: opentracing.Span) => span.finish();

const finishSpanWithError = (span: opentracing.Span, error: Error) => {
  span.setTag(opentracing.Tags.ERROR, true);
  span.log({
    event: 'error',
    'error.object': error,
    message: error.message,
    stack: error.stack
  });
};

export const tracer = {
  startSpan,
  finishSpan,
  finishSpanWithError
};
