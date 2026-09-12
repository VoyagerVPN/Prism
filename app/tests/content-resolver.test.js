import test from 'node:test';
import assert from 'node:assert/strict';
import {createContentCatalog} from '../content_catalog.js';
import {resolveContentPlan} from '../content_resolver.js';

test('semantic selections разрешаются в воспроизводимый content snapshot и compiler-compatible настройки', () => {
  const catalog = createContentCatalog([
    {
      id: 'character:hero', type: 'Character', name: 'Hero', scopes: ['subject'],
      compatibleRecipes: ['checkpoint'],
      bindings: [
        {kind: 'prompt', positive: ['hero trigger', 'black hair'], negative: ['extra arms']},
        {kind: 'lora', name: 'Character\\hero-v2.safetensors', strength: 0.8},
      ],
    },
    {
      id: 'style:cinematic', type: 'Style', name: 'Cinematic', scopes: ['global'],
      bindings: [{kind: 'prompt', positive: ['cinematic lighting']}],
    },
    {
      id: 'concept:solarpunk', type: 'Concept', name: 'Solarpunk', scopes: ['global'],
      bindings: [
        {kind: 'prompt', positive: ['solarpunk city']},
        {kind: 'lora', name: 'Concept/solarpunk.safetensors', strength: 0.55},
      ],
    },
  ]);

  const plan = resolveContentPlan({
    catalog,
    selections: [
      {contentId: 'character:hero', scope: 'subject', subjectId: 'lead', parameters: {expression: 'calm'}},
      {contentId: 'style:cinematic', scope: 'global'},
      {contentId: 'concept:solarpunk', scope: 'global'},
    ],
    modelRecipe: {recipe: 'checkpoint', checkpoint: 'base.safetensors'},
  });

  assert.deepEqual(plan.contentParts, [
    {
      type: 'content', contentId: 'character:hero', contentType: 'Character', name: 'Hero',
      scope: 'subject', subjectId: 'lead',
      snapshot: {
        prompt: ['hero trigger', 'black hair'], negative: ['extra arms'],
        bindings: [{kind: 'lora', name: 'Character/hero-v2.safetensors', strength: 0.8, clipStrength: 0.8}],
        parameters: {expression: 'calm'}, recipe: 'checkpoint',
      },
    },
    {
      type: 'content', contentId: 'style:cinematic', contentType: 'Style', name: 'Cinematic',
      scope: 'global',
      snapshot: {prompt: ['cinematic lighting'], negative: [], bindings: [], parameters: {}, recipe: 'checkpoint'},
    },
    {
      type: 'content', contentId: 'concept:solarpunk', contentType: 'Concept', name: 'Solarpunk',
      scope: 'global',
      snapshot: {
        prompt: ['solarpunk city'], negative: [],
        bindings: [{kind: 'lora', name: 'Concept/solarpunk.safetensors', strength: 0.55, clipStrength: 0.55}],
        parameters: {}, recipe: 'checkpoint',
      },
    },
  ]);
  assert.deepEqual(plan.compilerSettings, {
    recipe: 'checkpoint', checkpoint: 'base.safetensors',
    positiveParts: plan.contentParts,
    negative: '',
  });
  assert.throws(() => { plan.contentParts[0].snapshot.prompt.push('changed'); }, TypeError);
});

test('одинаковая backend LoRA дедуплицируется без потери semantic provenance', () => {
  const catalog = createContentCatalog([
    {
      id: 'character:hero', type: 'Character', name: 'Hero', scopes: ['global'],
      bindings: [{kind: 'lora', name: 'Shared\\identity.safetensors', strength: 0.7}],
    },
    {
      id: 'style:hero-render', type: 'Style', name: 'Hero render', scopes: ['global'],
      bindings: [{kind: 'lora', name: 'Shared/identity.safetensors', strength: 0.7}],
    },
  ]);
  const plan = resolveContentPlan({
    catalog,
    selections: [
      {contentId: 'character:hero', scope: 'global'},
      {contentId: 'style:hero-render', scope: 'global'},
    ],
    modelRecipe: {recipe: 'checkpoint', checkpoint: 'base.safetensors'},
  });

  assert.deepEqual(plan.modelPatches, [{
    contentId: 'character:hero', contentIds: ['character:hero', 'style:hero-render'],
    scope: 'global', kind: 'lora', name: 'Shared/identity.safetensors', strength: 0.7, clipStrength: 0.7,
  }]);
  assert.deepEqual(plan.compilerSettings.positiveParts.map(part => part.contentId), [
    'character:hero', 'style:hero-render',
  ]);
  assert.deepEqual(plan.diagnostics, [{
    level: 'info', code: 'duplicate-lora',
    message: 'LoRA Shared/identity.safetensors объединена для character:hero, style:hero-render.',
    contentIds: ['character:hero', 'style:hero-render'],
  }]);
});

test('resolver отклоняет отсутствующие entities, неверный scope, recipe и конфликтующие веса LoRA', () => {
  const resolve = (entries, selections, recipe = 'checkpoint') => resolveContentPlan({
    catalog: createContentCatalog(entries), selections, modelRecipe: {recipe, checkpoint: 'base.safetensors'},
  });
  const scoped = [{
    id: 'pose:portrait', type: 'Pose', name: 'Portrait', scopes: ['subject'], compatibleRecipes: ['checkpoint'],
    bindings: [{kind: 'prompt', positive: ['portrait pose']}],
  }];
  assert.throws(() => resolve(scoped, [{contentId: 'pose:missing', scope: 'global'}]), /отсутствует/);
  assert.throws(() => resolve(scoped, [{contentId: 'pose:portrait', scope: 'global'}]), /Scope global недоступен/);
  assert.throws(() => resolve(scoped, [{contentId: 'pose:portrait', scope: 'subject'}]), /требует subjectId/);
  assert.throws(
    () => resolve(scoped, [{contentId: 'pose:portrait', scope: 'subject', subjectId: 'lead'}], 'anima'),
    /несовместим с recipe anima/,
  );

  const conflict = [
    {id: 'style:a', type: 'Style', name: 'A', bindings: [{kind: 'lora', name: 'same.safetensors', strength: 0.5}]},
    {id: 'effect:b', type: 'Effect', name: 'B', bindings: [{kind: 'lora', name: 'same.safetensors', strength: 0.8}]},
  ];
  assert.throws(
    () => resolve(conflict, [{contentId: 'style:a', scope: 'global'}, {contentId: 'effect:b', scope: 'global'}]),
    /несовместимые веса/,
  );
});

test('control, reference и workflow bindings остаются declarative workflow augmentations', () => {
  const catalog = createContentCatalog([{
    id: 'processing:guided', type: 'Processing', name: 'Guided processing', scopes: ['global'],
    bindings: [
      {kind: 'control', name: 'depth', parameters: {strength: 0.6}},
      {kind: 'reference', name: 'identity', parameters: {weight: 0.75}},
      {kind: 'workflow', name: 'face-detail', parameters: {steps: 12}},
    ],
  }]);
  const plan = resolveContentPlan({
    catalog, selections: [{contentId: 'processing:guided', scope: 'global'}],
    modelRecipe: {recipe: 'checkpoint', checkpoint: 'base.safetensors'},
  });
  assert.deepEqual(plan.workflowAugmentations, [
    {contentId: 'processing:guided', scope: 'global', kind: 'control', name: 'depth', parameters: {strength: 0.6}},
    {contentId: 'processing:guided', scope: 'global', kind: 'reference', name: 'identity', parameters: {weight: 0.75}},
    {contentId: 'processing:guided', scope: 'global', kind: 'workflow', name: 'face-detail', parameters: {steps: 12}},
  ]);
  assert.deepEqual(plan.contentParts[0].snapshot.bindings.map(binding => binding.kind), ['control', 'reference', 'workflow']);
});

test('resolver выбирает backend-реализацию для текущего recipe и сохраняет recipe в snapshot', () => {
  const catalog=createContentCatalog([{
    id:'style:soft',type:'Style',name:'Мягкий стиль',scopes:['global'],bindings:[
      {kind:'prompt',positive:['soft style']},
      {kind:'lora',name:'Style/Illustrious/soft.safetensors',strength:0.8,compatibleRecipes:['checkpoint']},
      {kind:'lora',name:'Style/Anima/soft.safetensors',strength:0.6,compatibleRecipes:['anima']},
    ],
  }]);

  const checkpoint=resolveContentPlan({catalog,selections:[{contentId:'style:soft',scope:'global'}],modelRecipe:{recipe:'checkpoint'}});
  const anima=resolveContentPlan({catalog,selections:[{contentId:'style:soft',scope:'global'}],modelRecipe:{recipe:'anima'}});

  assert.deepEqual(checkpoint.contentParts[0].snapshot.bindings.map(binding=>binding.name),['Style/Illustrious/soft.safetensors']);
  assert.deepEqual(anima.contentParts[0].snapshot.bindings.map(binding=>binding.name),['Style/Anima/soft.safetensors']);
  assert.equal(checkpoint.contentParts[0].snapshot.recipe,'checkpoint');
  assert.equal(anima.contentParts[0].snapshot.recipe,'anima');
});
