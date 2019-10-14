export const tryParse = <T>(value: string, defaultValue: T): T => {
  try {
    return JSON.parse(value);
  } catch (_) {
    return defaultValue;
  }
};
