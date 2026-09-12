import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTENT_TYPES, createContentCatalog} from '../content_catalog.js';

test('каталог хранит типизированные сущности по стабильному semantic ID, а не по пути backend', () => {
  assert.deepEqual(CONTENT_TYPES, [
    'Character', 'Concept', 'Style', 'Pose', 'Clothing',
    'Object', 'Background', 'Effect', 'Processing',
  ]);

  const catalog = createContentCatalog(CONTENT_TYPES.map((type, index) => ({
    id: `${type.toLowerCase()}:sample`,
    type,
    name: `${type} sample`,
    scopes: ['global'],
    bindings: index === 0
      ? [{kind: 'lora', name: 'Character/old-file.safetensors', strength: 0.8, compatibleRecipes: ['checkpoint']}]
      : [{kind: 'prompt', positive: [`${type.toLowerCase()} tag`]}],
  })));

  assert.equal(catalog.get('character:sample').id, 'character:sample');
  assert.equal(catalog.get('character:sample').bindings[0].name, 'Character/old-file.safetensors');
  assert.deepEqual(catalog.get('character:sample').bindings[0].compatibleRecipes, ['checkpoint']);
  assert.deepEqual(catalog.list({type: 'Processing'}).map(entity => entity.id), ['processing:sample']);
  assert.throws(() => { catalog.get('character:sample').name = 'changed'; }, TypeError);

  const moved = createContentCatalog([{
    ...catalog.get('character:sample'),
    bindings: [{kind: 'lora', name: 'Moved/new-file.safetensors', strength: 0.8}],
  }]);
  assert.equal(moved.get('character:sample').id, 'character:sample');
});

test('каталог защитно отклоняет неизвестные структуры и path-like IDs', () => {
  assert.throws(() => createContentCatalog(null), /массивом/);
  assert.throws(() => createContentCatalog([{
    id: 'Character\\hero.safetensors', type: 'Character', name: 'Hero',
    bindings: [{kind: 'lora', name: 'hero.safetensors'}],
  }]), /semantic ID/);
  assert.throws(() => createContentCatalog([{
    id: 'character:hero', type: 'Unknown', name: 'Hero',
    bindings: [{kind: 'lora', name: 'hero.safetensors'}],
  }]), /Неизвестный тип/);
  const duplicate = {
    id: 'style:ink', type: 'Style', name: 'Ink',
    bindings: [{kind: 'prompt', positive: ['ink']}],
  };
  assert.throws(() => createContentCatalog([duplicate, duplicate]), /Повторяющийся content ID/);
  assert.throws(() => createContentCatalog([{
    id: 'effect:bad', type: 'Effect', name: 'Bad',
    bindings: [{kind: 'shell', name: 'run'}],
  }]), /Неизвестный backend binding/);
  assert.throws(() => createContentCatalog([{
    id: 'style:unsafe', type: 'Style', name: 'Unsafe',
    bindings: [{kind: 'lora', name: '../outside.safetensors'}],
  }]), /backend-модели/);
});
