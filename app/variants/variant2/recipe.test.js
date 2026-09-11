import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrompt, normalizeCharacter, selectVariant, splitAuthorTags } from './recipe.js';

const isabella = {
  name: 'Isabella',
  trigger: 'IsabellaGarciaShapiro',
  appearance: 'black hair, dark blue eyes',
  appearances: { 'По умолчанию': 'black hair, dark blue eyes', 'С бантом': 'black hair, pink bow' },
  activeAppearanceName: 'По умолчанию',
  outfits: { 'По умолчанию': 'pink dress', 'Поход': 'green uniform' },
  activeOutfitName: 'По умолчанию',
  outfitEnabled: true,
  variantLinks: { 'С бантом': 'Поход' },
  variantsLinked: true,
  lora: 'Character\\Isabella.safetensors',
  strength: 1,
};

test('рецепт показывает каждый включённый слой промпта один раз', () => {
  const character = normalizeCharacter(isabella);
  assert.equal(
    buildPrompt({ scene: 'portrait, garden', character, extra: 'soft light' }),
    'portrait, garden, IsabellaGarciaShapiro, black hair, dark blue eyes, pink dress, soft light',
  );
  character.outfitEnabled = false;
  assert.equal(
    buildPrompt({ scene: 'portrait, garden', character, extra: '' }),
    'portrait, garden, IsabellaGarciaShapiro, black hair, dark blue eyes',
  );
});

test('связанный выбор внешности переключает сохранённый комплект', () => {
  const character = normalizeCharacter(isabella);
  selectVariant(character, 'appearance', 'С бантом');
  assert.equal(character.activeAppearanceName, 'С бантом');
  assert.equal(character.activeOutfitName, 'Поход');
  assert.equal(character.appearance, 'black hair, pink bow');
});

test('реальная Isabella хранит одежду, но не включает её при выключенном флаге', () => {
  const database = JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url), 'utf8'));
  const character = normalizeCharacter(database['Изабелла']);
  assert.match(character.outfits[character.activeOutfitName], /pink dress/);
  assert.doesNotMatch(buildPrompt({ character }), /pink dress/);
  assert.equal(splitAuthorTags(character.source)[0], 'IsabellaGarciaShapiro');
});
