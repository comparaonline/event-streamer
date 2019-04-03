process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
process.env.ALLOW_CONFIG_MUTATIONS = 'y';
import config = require('config');

export const extendConfig = <A>(configs: Partial<A>, defaultConfig: Partial<A>): A => {
  const clonedConfig = config.util.cloneDeep(defaultConfig);
  config.util.extendDeep(clonedConfig, configs);
  config.util.setModuleDefaults('event-streamer', clonedConfig);
  return config.get('event-streamer');
};
