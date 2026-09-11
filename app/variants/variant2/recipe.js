const text = value => typeof value === 'string' ? value.trim() : '';

export function normalizeCharacter(source = {}) {
  const appearances = source.appearances && typeof source.appearances === 'object'
    ? structuredClone(source.appearances)
    : { 'По умолчанию': text(source.appearance) };
  const outfits = source.outfits && typeof source.outfits === 'object'
    ? structuredClone(source.outfits)
    : { 'По умолчанию': '' };
  if (!Object.keys(appearances).length) appearances['По умолчанию'] = '';
  if (!Object.keys(outfits).length) outfits['По умолчанию'] = '';
  const activeAppearanceName = Object.hasOwn(appearances, source.activeAppearanceName)
    ? source.activeAppearanceName
    : Object.keys(appearances)[0];
  const activeOutfitName = Object.hasOwn(outfits, source.activeOutfitName)
    ? source.activeOutfitName
    : Object.keys(outfits)[0];
  return {
    ...structuredClone(source),
    name: text(source.name) || 'Без имени',
    trigger: text(source.trigger),
    appearances,
    activeAppearanceName,
    appearance: text(appearances[activeAppearanceName]),
    outfits,
    activeOutfitName,
    outfitEnabled: source.outfitEnabled !== false,
    variantsLinked: source.variantsLinked === true,
    variantLinks: source.variantLinks && typeof source.variantLinks === 'object' ? structuredClone(source.variantLinks) : {},
    lora: text(source.lora) || 'None',
    strength: Number.isFinite(Number(source.strength)) ? Number(source.strength) : 1,
    source: source.source && typeof source.source === 'object' ? structuredClone(source.source) : {},
  };
}

export function selectVariant(character, kind, name) {
  if (kind === 'appearance' && Object.hasOwn(character.appearances, name)) {
    character.activeAppearanceName = name;
    character.appearance = character.appearances[name];
    const linkedOutfit = character.variantLinks?.[name];
    if (character.variantsLinked && Object.hasOwn(character.outfits, linkedOutfit)) {
      character.activeOutfitName = linkedOutfit;
    }
  }
  if (kind === 'outfit' && Object.hasOwn(character.outfits, name)) {
    character.activeOutfitName = name;
    if (character.variantsLinked) {
      const linkedAppearance = Object.entries(character.variantLinks ?? {})
        .find(([, outfit]) => outfit === name)?.[0];
      if (linkedAppearance && Object.hasOwn(character.appearances, linkedAppearance)) {
        character.activeAppearanceName = linkedAppearance;
        character.appearance = character.appearances[linkedAppearance];
      }
    }
  }
  return character;
}

export function buildPrompt({ scene = '', character, extra = '' }) {
  const layers = [
    scene,
    character?.trigger,
    character?.appearances?.[character.activeAppearanceName] ?? character?.appearance,
    character?.outfitEnabled ? character?.outfits?.[character.activeOutfitName] : '',
    extra,
  ];
  return layers.map(text).filter(Boolean).join(', ');
}

export function splitAuthorTags(source = {}) {
  const raw = [...(Array.isArray(source.triggers) ? source.triggers : []), ...(Array.isArray(source.tags) ? source.tags : [])];
  const seen = new Set();
  return raw.flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(value => value && !seen.has(value.toLocaleLowerCase()) && seen.add(value.toLocaleLowerCase()));
}
