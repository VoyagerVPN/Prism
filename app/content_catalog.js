export const CONTENT_TYPES = Object.freeze([
  'Character', 'Concept', 'Style', 'Pose', 'Clothing',
  'Object', 'Background', 'Effect', 'Processing',
]);

const CONTENT_TYPE_SET = new Set(CONTENT_TYPES);
const CONTENT_ID = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9._-]*)+$/;

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} должен быть объектом.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function strings(value, label, {allowEmpty = true} = {}) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || (!allowEmpty && !item.trim()))) {
    throw new Error(`${label} должен быть массивом строк.`);
  }
  return [...value];
}

function recipes(value) {
  if (value === undefined) return null;
  const result = strings(value, 'Совместимые recipes', {allowEmpty: false});
  if (!result.length || new Set(result).size !== result.length) {
    throw new Error('Список совместимых recipes не должен быть пустым или содержать повторы.');
  }
  return result;
}

function normalizeBinding(input) {
  const binding = record(input, 'Backend binding');
  if (!['lora', 'prompt', 'control', 'reference', 'workflow'].includes(binding.kind)) {
    throw new Error(`Неизвестный backend binding: ${binding.kind}.`);
  }
  const compatibleRecipes = recipes(binding.compatibleRecipes);
  const compatibility = compatibleRecipes ? {compatibleRecipes} : {};
  if (binding.kind === 'lora') {
    if (typeof binding.name !== 'string' || !binding.name.trim()) throw new Error('LoRA binding требует имя backend-модели.');
    const name = binding.name.replaceAll('\\', '/');
    if (/^[a-z]:|^\/|[\x00-\x1f]/i.test(name) || name.split('/').some(segment => segment === '.' || segment === '..' || !segment)) {
      throw new Error('Некорректный путь backend-модели.');
    }
    const strength = Number(binding.strength ?? 1);
    const clipStrength = Number(binding.clipStrength ?? strength);
    if (!Number.isFinite(strength) || !Number.isFinite(clipStrength) || strength < -1 || strength > 2 || clipStrength < -1 || clipStrength > 2) {
      throw new Error('Вес LoRA должен быть конечным числом от −1 до 2.');
    }
    return {kind: 'lora', name, strength, clipStrength, ...compatibility};
  }
  if (binding.kind === 'prompt') {
    return {
      kind: 'prompt',
      positive: strings(binding.positive ?? [], 'Положительный prompt binding'),
      negative: strings(binding.negative ?? [], 'Отрицательный prompt binding'),
      ...compatibility,
    };
  }
  const name = typeof binding.name === 'string' && binding.name.trim() ? binding.name : null;
  if (!name) throw new Error(`${binding.kind} binding требует стабильное имя.`);
  const parameters = binding.parameters === undefined ? {} : structuredClone(record(binding.parameters, 'Параметры binding'));
  return {kind: binding.kind, name, parameters, ...compatibility};
}

export function createContentEntity(input) {
  const source = record(input, 'Content entity');
  if (typeof source.id !== 'string' || !CONTENT_ID.test(source.id) || /[/\\]/.test(source.id)) {
    throw new Error('Content ID должен быть стабильным semantic ID вида namespace:name и не содержать путь файла.');
  }
  if (!CONTENT_TYPE_SET.has(source.type)) throw new Error(`Неизвестный тип content entity: ${source.type}.`);
  if (!source.id.startsWith(`${source.type.toLowerCase()}:`)) throw new Error('Namespace content ID должен соответствовать типу сущности.');
  if (typeof source.name !== 'string' || !source.name.trim()) throw new Error('Content entity требует отображаемое имя.');
  const scopes = strings(source.scopes ?? ['global'], 'Scopes', {allowEmpty: false});
  if (!scopes.length || scopes.some(scope => !['global', 'subject'].includes(scope)) || new Set(scopes).size !== scopes.length) {
    throw new Error('Scopes могут содержать только global и subject без повторов.');
  }
  const compatibleRecipes = recipes(source.compatibleRecipes);
  if (!Array.isArray(source.bindings) || !source.bindings.length) throw new Error('Content entity требует хотя бы один backend binding.');
  return deepFreeze({
    id: source.id,
    type: source.type,
    name: source.name,
    scopes,
    ...(compatibleRecipes ? {compatibleRecipes} : {}),
    bindings: source.bindings.map(normalizeBinding),
  });
}

export function createContentCatalog(entries) {
  if (!Array.isArray(entries)) throw new Error('Каталог content entities должен быть массивом.');
  const entities = entries.map(createContentEntity);
  const byId = new Map();
  for (const entity of entities) {
    if (byId.has(entity.id)) throw new Error(`Повторяющийся content ID: ${entity.id}.`);
    byId.set(entity.id, entity);
  }
  const list = ({type} = {}) => {
    if (type !== undefined && !CONTENT_TYPE_SET.has(type)) throw new Error(`Неизвестный тип content entity: ${type}.`);
    return Object.freeze(entities.filter(entity => type === undefined || entity.type === type));
  };
  return Object.freeze({
    version: 1,
    entities: Object.freeze([...entities]),
    get: id => byId.get(id),
    has: id => byId.has(id),
    list,
  });
}
