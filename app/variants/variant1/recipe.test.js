import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, createRecipeState, displayVariantLabel, normalizeCharacter, selectVariant, updateRecipe } from './recipe.js';

test('рецепт Isabella собирает trigger, выбранную внешность, одежду и сцену без пустых секций', () => {
  const character = normalizeCharacter('Isabella', {
    trigger: 'IsabellaGarciaShapiro',
    appearances: { 'По умолчанию': 'black hair, long hair, pink bow' },
    activeAppearanceName: 'По умолчанию',
    outfits: { 'По умолчанию': 'white shirt, pink dress' },
    activeOutfitName: 'По умолчанию',
    outfitEnabled: true,
  });

  assert.equal(
    buildPrompt({
      scene: 'official style, screencap',
      trigger: character.trigger,
      appearance: character.appearances[character.activeAppearanceName],
      outfit: character.outfits[character.activeOutfitName],
      outfitEnabled: character.outfitEnabled,
    }),
    'official style, screencap, IsabellaGarciaShapiro, black hair, long hair, pink bow, white shirt, pink dress',
  );
});

test('пустое отображаемое имя набора не выдаёт внутренний ключ пользователю', () => {
  const character = normalizeCharacter('Isabella', {
    appearances: { 'По умолчанию': 'black hair' },
    variantNames: { appearance: { 'По умолчанию': '' } },
  });

  assert.equal(displayVariantLabel(character, 'appearance', 'По умолчанию'), 'Без названия · 1');
});

test('связанная внешность переключает комплект, а ручной итог сохраняется до явной пересборки', () => {
  const character = normalizeCharacter('Героиня', {
    trigger: 'heroine',
    appearances: { День: 'brown eyes', Ночь: 'silver eyes' },
    activeAppearanceName: 'День',
    outfits: { Лето: 'linen dress', Зима: 'warm coat' },
    activeOutfitName: 'Лето',
    variantsLinked: true,
    variantLinks: { День: 'Лето', Ночь: 'Зима' },
  });
  let state = createRecipeState(character, { scene: 'portrait' });
  state = updateRecipe(state, { finalPrompt: 'мой точный промпт' }, 'final');
  state = selectVariant(state, character, 'appearance', 'Ночь');

  assert.equal(state.outfitName, 'Зима');
  assert.equal(state.finalPrompt, 'мой точный промпт');
  assert.equal(state.compositionStale, true);
  assert.match(state.composedPrompt, /silver eyes/);
  assert.match(state.composedPrompt, /warm coat/);
});
