import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const draft7Meta = require('ajv/dist/refs/json-schema-draft-07.json');

export function createAjvInstance(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  // Ensure draft-07 metaschema is available for validation
  try {
    ajv.addMetaSchema(draft7Meta);
  } catch (_) {
    // Ignore if already added
  }
  addFormats(ajv);
  return ajv;
}
