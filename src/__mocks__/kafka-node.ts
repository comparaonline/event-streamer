import { emitterHelper } from '../test/emitter-helpers';

const kafka: any = jest.genMockFromModule('kafka-node');
type EmitterHelper = ReturnType<typeof emitterHelper>;
type Spies = ReturnType<typeof createSpies>;
const createSpies = ({ on, trigger, listeners }: EmitterHelper) => ({
  listeners,
  trigger,
  HighLevelProducer: {
    on: on('HighLevelProducer'),
    off: jest.fn(),
    send: jest.fn((_, cb) => cb()),
    start: jest.fn(),
    close: jest.fn(fn => fn())
  },
  ConsumerGroupStream: {
    on: on('ConsumerGroupStream'),
    off: jest.fn(),
    start: jest.fn(),
    resume: jest.fn(),
    close: jest.fn(fn => fn())
  }
});

const reset = (mock: any = kafka, spies = createSpies(emitterHelper())) => {
  mock.ConsumerGroupStream = jest.fn().mockImplementation(() => spies.ConsumerGroupStream);
  mock.KafkaClient = jest.fn().mockImplementation();
  mock.HighLevelProducer = jest.fn().mockImplementation(() => spies.HighLevelProducer);
  mock.spies = spies;
  mock.reset = reset;
};

reset();
export = kafka as { spies: Spies, reset: typeof reset };
