export function splitTags(value) {
  const source = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const seen = new Set();
  return source
    .split(/[,\n]+/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function joinTags(value) {
  return splitTags(value).join(', ');
}

export function normalizeCharacter(name, raw = {}) {
  const appearances = raw.appearances && Object.keys(raw.appearances).length
    ? { ...raw.appearances }
    : { 'По умолчанию': raw.appearance || '' };
  const outfits = raw.outfits && Object.keys(raw.outfits).length
    ? { ...raw.outfits }
    : { 'По умолчанию': raw.outfit || '' };
  const activeAppearanceName = Object.hasOwn(appearances, raw.activeAppearanceName)
    ? raw.activeAppearanceName
    : Object.keys(appearances)[0];
  const activeOutfitName = Object.hasOwn(outfits, raw.activeOutfitName)
    ? raw.activeOutfitName
    : Object.keys(outfits)[0];

  return {
    ...raw,
    name: raw.name || name,
    trigger: raw.trigger || '',
    lora: raw.lora || 'None',
    strength: Number.isFinite(Number(raw.strength)) ? Number(raw.strength) : 1,
    appearances,
    outfits,
    activeAppearanceName,
    activeOutfitName,
    outfitEnabled: raw.outfitEnabled !== false,
    source: raw.source || {},
  };
}

export function displayVariantLabel(character, kind, key) {
  const values = kind === 'appearance' ? character.appearances : character.outfits;
  const explicit = character.variantNames?.[kind]?.[key];
  if (typeof explicit === 'string') return explicit.trim() || `Без названия · ${Object.keys(values).indexOf(key) + 1}`;
  return key;
}

export function buildPrompt(parts) {
  const groups = [parts.scene, parts.trigger, parts.appearance];
  if (parts.outfitEnabled) groups.push(parts.outfit);
  groups.push(parts.extra);
  return joinTags(groups.filter(Boolean));
}

function deriveComposition(state) {
  return buildPrompt({
    scene: state.scene,
    trigger: state.trigger,
    appearance: state.appearanceEdits[state.appearanceName],
    outfit: state.outfitEdits[state.outfitName],
    outfitEnabled: state.outfitEnabled,
    extra: state.extra,
  });
}

export function createRecipeState(character, draft = {}) {
  const state = {
    characterName: character.name,
    appearanceName: Object.hasOwn(character.appearances, draft.appearanceName)
      ? draft.appearanceName
      : character.activeAppearanceName,
    outfitName: Object.hasOwn(character.outfits, draft.outfitName)
      ? draft.outfitName
      : character.activeOutfitName,
    appearanceEdits: { ...character.appearances, ...draft.appearanceEdits },
    outfitEdits: { ...character.outfits, ...draft.outfitEdits },
    trigger: draft.trigger ?? character.trigger,
    scene: draft.scene ?? '',
    extra: draft.extra ?? '',
    outfitEnabled: draft.outfitEnabled ?? character.outfitEnabled,
    loraEnabled: draft.loraEnabled ?? character.lora !== 'None',
    loraStrength: draft.loraStrength ?? character.strength,
    finalPrompt: draft.finalPrompt ?? '',
    finalMode: draft.finalMode ?? 'synced',
    compositionStale: false,
  };
  state.composedPrompt = deriveComposition(state);
  if (state.finalMode === 'synced' || !state.finalPrompt) state.finalPrompt = state.composedPrompt;
  state.compositionStale = state.finalMode === 'manual' && state.finalPrompt !== state.composedPrompt;
  return state;
}

export function updateRecipe(state, patch, source = 'component') {
  const next = { ...state, ...patch };
  if (source === 'final') {
    next.finalMode = 'manual';
    next.composedPrompt = deriveComposition(next);
    next.compositionStale = next.finalPrompt !== next.composedPrompt;
    return next;
  }
  next.composedPrompt = deriveComposition(next);
  if (next.finalMode === 'synced') next.finalPrompt = next.composedPrompt;
  next.compositionStale = next.finalMode === 'manual' && next.finalPrompt !== next.composedPrompt;
  return next;
}

export function selectVariant(state, character, kind, name) {
  const next = { ...state };
  if (kind === 'appearance' && Object.hasOwn(character.appearances, name)) {
    next.appearanceName = name;
    const pairedOutfit = character.variantLinks?.[name];
    if (character.variantsLinked && Object.hasOwn(character.outfits, pairedOutfit)) next.outfitName = pairedOutfit;
  }
  if (kind === 'outfit' && Object.hasOwn(character.outfits, name)) {
    next.outfitName = name;
    if (character.variantsLinked) {
      const pairedAppearance = Object.entries(character.variantLinks || {})
        .find(([, outfit]) => outfit === name)?.[0];
      if (Object.hasOwn(character.appearances, pairedAppearance)) next.appearanceName = pairedAppearance;
    }
  }
  return updateRecipe(next, {});
}

export function applyComposition(state) {
  const composedPrompt = deriveComposition(state);
  return { ...state, composedPrompt, finalPrompt: composedPrompt, finalMode: 'synced', compositionStale: false };
}
