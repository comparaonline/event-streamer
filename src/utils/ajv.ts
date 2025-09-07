import Ajv from 'ajv';

export function createAjvInstance(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  return ajv;
}
