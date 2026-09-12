function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} должен быть объектом.`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizedLora(binding) {
  return {
    kind: 'lora',
    name: binding.name.replaceAll('\\', '/'),
    strength: binding.strength,
    clipStrength: binding.clipStrength,
  };
}

function normalizeSelection(input, catalog, recipe) {
  const selection = record(input, 'Semantic selection');
  if (typeof selection.contentId !== 'string' || !selection.contentId) throw new Error('Semantic selection требует contentId.');
  const entity = catalog.get(selection.contentId);
  if (!entity) throw new Error(`Content entity ${selection.contentId} отсутствует в каталоге.`);
  if (!['global', 'subject'].includes(selection.scope)) throw new Error('Scope выбора должен быть global или subject.');
  if (!entity.scopes.includes(selection.scope)) throw new Error(`Scope ${selection.scope} недоступен для ${entity.id}.`);
  if (selection.scope === 'subject' && (typeof selection.subjectId !== 'string' || !selection.subjectId.trim())) {
    throw new Error(`Subject scope для ${entity.id} требует subjectId.`);
  }
  if (selection.scope === 'global' && selection.subjectId !== undefined) throw new Error('Global scope не принимает subjectId.');
  if (entity.compatibleRecipes && !entity.compatibleRecipes.includes(recipe)) {
    throw new Error(`${entity.id} несовместим с recipe ${recipe}.`);
  }
  const parameters = selection.parameters === undefined ? {} : structuredClone(record(selection.parameters, 'Параметры выбора'));
  return {selection, entity, parameters};
}

export function resolveContentPlan(input) {
  const request = record(input, 'Content resolution request');
  if (!request.catalog || typeof request.catalog.get !== 'function') throw new Error('Resolver требует content catalog.');
  if (!Array.isArray(request.selections)) throw new Error('Semantic selections должны быть массивом.');
  const modelRecipe = structuredClone(record(request.modelRecipe, 'Model recipe'));
  if (typeof modelRecipe.recipe !== 'string' || !modelRecipe.recipe.trim()) throw new Error('Model recipe требует recipe.');

  const resolved = request.selections.map(selection => normalizeSelection(selection, request.catalog, modelRecipe.recipe));
  const promptContributions = [];
  const modelPatches = [];
  const workflowAugmentations = [];
  const diagnostics = [];
  const contentParts = [];
  const loraByName = new Map();

  for (const {selection, entity, parameters} of resolved) {
    const availableBindings = entity.bindings.filter(binding => !binding.compatibleRecipes || binding.compatibleRecipes.includes(modelRecipe.recipe));
    const prompt = availableBindings.filter(binding => binding.kind === 'prompt');
    const positiveTags = prompt.flatMap(binding => binding.positive);
    const negativeTags = prompt.flatMap(binding => binding.negative);
    const backendBindings = availableBindings
      .filter(binding => binding.kind !== 'prompt')
      .map(binding => binding.kind === 'lora' ? normalizedLora(binding) : structuredClone(binding));
    const context = {
      contentId: entity.id,
      scope: selection.scope,
      ...(selection.scope === 'subject' ? {subjectId: selection.subjectId} : {}),
    };
    if (positiveTags.length || negativeTags.length) {
      promptContributions.push({...context, positive: [...positiveTags], negative: [...negativeTags]});
    }
    for (const binding of backendBindings) {
      if (binding.kind === 'lora') {
        const existing = loraByName.get(binding.name);
        if (existing) {
          if (existing.strength !== binding.strength || existing.clipStrength !== binding.clipStrength) {
            throw new Error(`LoRA ${binding.name} получила несовместимые веса от ${existing.contentId} и ${entity.id}.`);
          }
          existing.contentIds.push(entity.id);
          diagnostics.push({
            level: 'info', code: 'duplicate-lora',
            message: `LoRA ${binding.name} объединена для ${existing.contentIds.join(', ')}.`,
            contentIds: [...existing.contentIds],
          });
        } else {
          const patch = {...context, contentIds: [entity.id], ...binding};
          loraByName.set(binding.name, patch);
          modelPatches.push(patch);
        }
      } else workflowAugmentations.push({...context, ...binding});
    }
    contentParts.push({
      type: 'content', contentId: entity.id, contentType: entity.type, name: entity.name,
      scope: selection.scope,
      ...(selection.scope === 'subject' ? {subjectId: selection.subjectId} : {}),
      snapshot: {prompt: [...positiveTags], negative: [...negativeTags], bindings: backendBindings, parameters, recipe: modelRecipe.recipe},
    });
  }

  const compilerSettings = {
    ...modelRecipe,
    positiveParts: contentParts,
    negative: '',
  };
  return deepFreeze({
    version: 1,
    recipe: modelRecipe.recipe,
    modelRecipe,
    selections: resolved.map(({selection}) => structuredClone(selection)),
    contentParts,
    promptContributions,
    modelPatches,
    workflowAugmentations,
    diagnostics,
    compilerSettings,
  });
}
