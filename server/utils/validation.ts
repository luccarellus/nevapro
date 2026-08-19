type Result<T> = { data: T } | { error: string };
type Row = Record<string, unknown>;

const objectBody = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readText(value: unknown, field: string, limit: number, required = false): Result<string | undefined> {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `O campo ${field} é obrigatório.` } : { data: undefined };
  }
  if (typeof value !== 'string') return { error: `O campo ${field} deve ser um texto.` };
  const data = value.trim();
  if (required && !data) return { error: `O campo ${field} é obrigatório.` };
  if (data.length > limit) return { error: `O campo ${field} deve ter no máximo ${limit} caracteres.` };
  return { data };
}

function readInteger(value: unknown, field: string, max: number): Result<number | undefined> {
  if (value === undefined || value === null || value === '') return { data: undefined };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    return { error: `O campo ${field} deve ser um número inteiro entre 0 e ${max}.` };
  }
  return { data: value };
}

function readFields(body: Row, specs: readonly (readonly [string, number, boolean])[]): Result<Row> {
  const data: Row = {};
  for (const [field, limit, required] of specs) {
    const result = readText(body[field], field, limit, required);
    if ('error' in result) return result;
    if (result.data !== undefined) data[field] = result.data;
  }
  return { data };
}

export function validateMaterialInput(body: unknown, partial = false): Result<Row> {
  if (!objectBody(body)) return { error: 'Corpo da requisição inválido.' };
  const result = readFields(body, [
    ['title', 255, !partial], ['type', 50, !partial], ['subject', 255, false],
    ['foco', 255, false], ['url', 2048, !partial], ['description', 5000, false],
  ]);
  if ('error' in result) return result;
  if (partial && Object.keys(result.data).length === 0) return { error: 'Nenhum campo válido foi informado.' };
  return result;
}

export function validateEventInput(body: unknown, partial = false): Result<Row> {
  if (!objectBody(body)) return { error: 'Corpo da requisição inválido.' };
  const result = readFields(body, [
    ['title', 255, !partial], ['description', 5000, false], ['date', 50, false],
    ['time', 50, false], ['type', 50, false], ['category', 100, false], ['observation', 5000, false],
  ]);
  if ('error' in result) return result;
  for (const [field, max] of [['questionsCount', 10000], ['xpReward', 1000000]] as const) {
    const number = readInteger(body[field], field, max);
    if ('error' in number) return number;
    if (number.data !== undefined) result.data[field] = number.data;
  }
  if (partial && Object.keys(result.data).length === 0) return { error: 'Nenhum campo válido foi informado.' };
  return result;
}

export function validateMuralInput(body: unknown, partial = false): Result<Row> {
  if (!objectBody(body)) return { error: 'Corpo da requisição inválido.' };
  const result = readFields(body, [
    ['title', 255, !partial], ['content', 10000, !partial], ['type', 50, false],
    ['category', 50, false], ['tag', 100, false], ['sender', 255, false],
  ]);
  if ('error' in result) return result;
  if (partial && Object.keys(result.data).length === 0) return { error: 'Nenhum campo válido foi informado.' };
  return result;
}
