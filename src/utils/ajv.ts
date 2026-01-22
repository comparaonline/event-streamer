import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}
