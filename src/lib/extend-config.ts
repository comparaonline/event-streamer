process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
process.env.ALLOW_CONFIG_MUTATIONS = 'y';
import config = require('config');

export const extendConfig = <A>(configs: Partial<A>, defaultConfig: Partial<A>): A => {
  config.util.extendDeep(defaultConfig, configs);
  config.util.setModuleDefaults('event-streamer', defaultConfig);
  return defaultConfig as A;
};
