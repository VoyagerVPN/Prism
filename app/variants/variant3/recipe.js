export function parseTags(value = '') {
  const seen = new Set();
  return String(value).split(',').map(tag => tag.trim()).filter(tag => {
    const key = tag.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function variantLabel(character, kind, key) {
  const explicit = character.variantNames?.[kind] && Object.hasOwn(character.variantNames[kind], key)
    ? character.variantNames[kind][key] : key;
  if (explicit) return explicit;
  const values = kind === 'appearance' ? character.appearances : character.outfits;
  return `Без названия · ${Math.max(1, Object.keys(values ?? {}).indexOf(key) + 1)}`;
}

export function createSession(character) {
  const appearances = character.appearances ?? { 'По умолчанию': character.appearance ?? '' };
  const outfits = character.outfits ?? { 'По умолчанию': character.outfit ?? '' };
  const appearanceKey = character.activeAppearanceName && Object.hasOwn(appearances, character.activeAppearanceName)
    ? character.activeAppearanceName : Object.keys(appearances)[0];
  const outfitKey = character.activeOutfitName && Object.hasOwn(outfits, character.activeOutfitName)
    ? character.activeOutfitName : Object.keys(outfits)[0];
  return {
    characterName: character.name,
    triggerTags: parseTags(character.trigger),
    appearanceKey,
    appearanceTags: parseTags(appearances[appearanceKey]),
    outfitKey,
    outfitTags: parseTags(outfits[outfitKey]),
    outfitEnabled: character.outfitEnabled !== false,
    lora: character.lora || 'None',
    loraEnabled: character.lora !== 'None',
    strength: Number.isFinite(character.strength) ? character.strength : 1,
    scene: '',
    customPrompt: '',
    promptMode: 'assembled',
  };
}

export function selectVariant(session, character, kind, key) {
  const values = kind === 'appearance'
    ? character.appearances ?? { 'По умолчанию': character.appearance ?? '' }
    : character.outfits ?? { 'По умолчанию': character.outfit ?? '' };
  if (!Object.hasOwn(values, key)) return;
  if (kind === 'appearance') {
    session.appearanceKey = key;
    session.appearanceTags = parseTags(values[key]);
  } else {
    session.outfitKey = key;
    session.outfitTags = parseTags(values[key]);
  }
}

export function buildPrompt(session, scene = session.scene) {
  const groups = [session.triggerTags, session.appearanceTags];
  if (session.outfitEnabled) groups.push(session.outfitTags);
  groups.push(parseTags(scene));
  return parseTags(groups.flat().join(', ')).join(', ');
}

export function recipeFromSession(session) {
  const assembledPrompt = buildPrompt(session);
  return {
    character: session.characterName,
    prompt: session.promptMode === 'custom' ? session.customPrompt.trim() : assembledPrompt,
    promptMode: session.promptMode,
    parts: {
      trigger: [...session.triggerTags],
      appearance: [...session.appearanceTags],
      outfit: session.outfitEnabled ? [...session.outfitTags] : [],
      scene: parseTags(session.scene),
    },
    loras: session.loraEnabled && session.lora !== 'None'
      ? [{ name: session.lora, strength: session.strength }]
      : [],
  };
}
