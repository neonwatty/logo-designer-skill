export class WorkflowError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
export function requireThat(condition, code, message, details) {
  if (!condition) throw new WorkflowError(code, message, details);
}
export const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$', maxLength: 64 };
export const text = { type: 'string', minLength: 1, maxLength: 4096 };
export const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
export const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const array = (items, maxItems = 32) => ({ type: 'array', items, minItems: 1, maxItems });
export const briefSchema = object({ format: { enum: ['icon', 'wordmark', 'combination'] }, description: text });
export const sourceSchema = object({ id, path: text, kind: { enum: ['logo', 'icon'] } });
export const exportSchema = object({
  artifactId: id, iconId: { type: ['string', 'null'], pattern: id.pattern, maxLength: 64 },
  sizes: array({ type: 'integer', minimum: 1, maximum: 2048 }, 12),
});
export const eventSchemas = {
  selectArtifact: object({ artifactId: id }),
  requestRefinement: object({ instruction: text }),
  requestExport: exportSchema,
  answerQuestion: object({ questionId: id, answer: text }),
  cancel: object({}),
};
export const actionSchemas = {
  askUser: object({ questionId: id, prompt: text, choices: array(text, 16) }),
  submitRefinement: object({ refinementId: id, baseSha256: hash, source: sourceSchema }),
  renderExport: object({}),
  finish: object({}),
};
export function validate(schema, value, label = 'payload') {
  const fail = () => { throw new WorkflowError('INVALID_INPUT', `Invalid ${label}.`); };
  if (schema.enum && !schema.enum.includes(value)) fail();
  if (schema.const !== undefined && value !== schema.const) fail();
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actual) && !(types.includes('integer') && Number.isSafeInteger(value))) fail();
  }
  if (typeof value === 'string') {
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)
      || (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))) fail();
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail();
  if (schema.type === 'object') {
    if (!value || Array.isArray(value)) fail();
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => !Object.hasOwn(value, key))) fail();
    for (const [key, sub] of Object.entries(schema.properties)) validate(sub, value[key], `${label}.${key}`);
  }
  if (schema.type === 'array') {
    if (value.length < schema.minItems || value.length > schema.maxItems) fail();
    value.forEach((item, index) => validate(schema.items, item, `${label}[${index}]`));
  }
  return value;
}
export function namedPayload(schemas, value) {
  validate(object({ type: text, arguments: {} }), value);
  requireThat(Object.hasOwn(schemas, value.type), 'FORBIDDEN_EVENT', 'Unknown or internal event/action.');
  validate(schemas[value.type], value.arguments);
  return value;
}
