export interface Logger {
  info(val: string): void;
  debug(val: string): void;
  error(val: string): void;
}
