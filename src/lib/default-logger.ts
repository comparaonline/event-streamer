import { Logger } from '../interfaces/logger';

const doNothing = () => { };

export const defaultLogger: Logger = {
  info: doNothing,
  debug: doNothing,
  error: doNothing
};

export const setLogger = (newLogger: Logger) => {
  defaultLogger.info = newLogger.info;
  defaultLogger.debug = newLogger.debug;
  defaultLogger.error = newLogger.error;
};
