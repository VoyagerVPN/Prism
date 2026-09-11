import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, createSession, parseTags, selectVariant, variantLabel } from './recipe.js';

const isabella = {
  name: 'Isabella',
  trigger: 'IsabellaGarciaShapiro',
  appearances: { base: 'black hair, long hair, pink bow' },
  activeAppearanceName: 'base',
  outfits: { classic: 'white shirt, pink dress' },
  activeOutfitName: 'classic',
  outfitEnabled: false,
  lora: 'Character\\Isabella.safetensors',
  strength: 1,
};

test('сеанс Isabella наследует теги, но уважает выключенную одежду', () => {
  const session = createSession(isabella);
  assert.deepEqual(session.triggerTags, ['IsabellaGarciaShapiro']);
  assert.deepEqual(session.appearanceTags, ['black hair', 'long hair', 'pink bow']);
  assert.deepEqual(session.outfitTags, ['white shirt', 'pink dress']);
  assert.equal(session.outfitEnabled, false);
  assert.equal(buildPrompt(session, 'garden, smile'), 'IsabellaGarciaShapiro, black hair, long hair, pink bow, garden, smile');
});

test('смена варианта заменяет только соответствующие теги текущего кадра', () => {
  const character = {
    ...isabella,
    appearances: { base: 'black hair', winter: 'black hair, red scarf' },
  };
  const session = createSession(character);
  session.outfitTags.push('earrings');
  selectVariant(session, character, 'appearance', 'winter');
  assert.deepEqual(session.appearanceTags, ['black hair', 'red scarf']);
  assert.deepEqual(session.outfitTags, ['white shirt', 'pink dress', 'earrings']);
});

test('теги очищаются, разбиваются по запятым и не дублируются без учёта регистра', () => {
  assert.deepEqual(parseTags('  Pink bow, long hair, pink BOW, ,dark blue eyes '), ['Pink bow', 'long hair', 'dark blue eyes']);
});

test('пустое авторское имя варианта не выдаёт внутренний ключ за название', () => {
  assert.equal(variantLabel({ appearances: { internal: 'black hair' }, variantNames: { appearance: { internal: '' } } }, 'appearance', 'internal'), 'Без названия · 1');
});
