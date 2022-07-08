import { Config } from '../interfaces';

let config: Config | null = null;

export function getConfig(): Config {
  if (config == null) {
    throw new Error('Event streamer not initialized');
  }
  return config;
}

export function setConfig(newConfig: Config): void {
  config = newConfig;
}
