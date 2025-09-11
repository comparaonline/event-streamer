import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export function createAjvInstance(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}
