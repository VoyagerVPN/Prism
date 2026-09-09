import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflow } from '../workflow.js';

const base = {
  recipe: 'checkpoint', checkpoint: 'novaKemonoXL_v80.safetensors',
  mode: 't2i', width: 1024, height: 1024, batchCount: 1,
  seed: 12345, steps: 20, cfg: 6, sampler: 'euler', scheduler: 'normal',
  positive: 'portrait', negative: 'blurry', loras: [], character: null,
};

test('Серия 1/4/9 содержит независимые кадры с воспроизводимыми seed', () => {
  for (const count of [1,4,9]) {
    const graph = compileWorkflow({...base,batchCount:count});
    const samplers = Object.values(graph).filter(node => node.class_type === 'KSampler');
    assert.equal(samplers.length,count);
    assert.deepEqual(samplers.map(node => node.inputs.seed),Array.from({length:count},(_,i) => base.seed+i));
    assert.equal(Object.values(graph).filter(node => node.class_type === 'SaveImage').length,count);
    for (const node of Object.values(graph).filter(node => node.class_type === 'EmptyLatentImage')) assert.equal(node.inputs.batch_size,1);
  }
  const variants = Object.values(compileWorkflow({...base,batchCount:4,variationStrength:.1,variationSeed:500})).filter(node => node.class_type === 'PrismVariationNoise');
  assert.deepEqual(variants.map(node => node.inputs.seed),[12345,12345,12345,12345]);
  assert.deepEqual(variants.map(node => node.inputs.variation_seed),[500,501,502,503]);
  assert.throws(() => compileWorkflow({...base,batchCount:3}),/1, 4 или 9/);
});

test('Вариация смешивает начальный шум и сохраняет параметры основного прохода', () => {
  const graph = compileWorkflow({...base,variationStrength:0.1,variationSeed:987});
  assert.equal(graph['7'].class_type,'SamplerCustomAdvanced');
  assert.deepEqual(graph[graph['7'].inputs.noise[0]].inputs,{seed:12345,variation_seed:987,strength:0.1});
  assert.equal(graph[graph['7'].inputs.guider[0]].inputs.cfg,6);
  assert.equal(graph[graph['7'].inputs.sigmas[0]].inputs.steps,20);
  assert.deepEqual(compileWorkflow({...base,variationStrength:0}),compileWorkflow(base));
  assert.throws(() => compileWorkflow({...base,variationStrength:1.1}),/Вариация/);
  assert.throws(() => compileWorkflow({...base,variationStrength:0.1,variationSeed:-1}),/Seed вариации/);
});

test('Clip skip меняет CLIP, переданный в текстовый энкодер', () => {
  const graph = compileWorkflow({ ...base, advancedToggle: true, clipSkip: 2 });
  const encode = Object.values(graph).find(node => node.class_type === 'CLIPTextEncode');
  const clip = graph[encode.inputs.clip[0]];
  assert.equal(clip.class_type, 'CLIPSetLastLayer');
  assert.equal(clip.inputs.stop_at_clip_layer, -2);
});

test('Улучшение выбранного файла масштабирует его перед сэмплингом без нового txt2img', () => {
  const graph = compileWorkflow({
    ...base, mode: 'i2i', operation: 'refine', inputImageName: 'selected.png',
    width: 1536, height: 1536, denoise: 0.3, upscaleSelect: '4x-UltraSharp.pth',
  });
  assert.ok(!Object.values(graph).some(node => node.class_type === 'EmptyLatentImage'));
  const scale = Object.values(graph).find(node => node.class_type === 'ImageScale');
  assert.equal(scale.inputs.width, 1536);
  const upscale = graph[scale.inputs.image[0]];
  assert.equal(upscale.class_type, 'ImageUpscaleWithModel');
  assert.equal(graph[upscale.inputs.image[0]].inputs.image, 'selected.png');
});

test('Нулевой denoise и CFG сохраняются в задании', () => {
  const graph = compileWorkflow({ ...base, mode: 'i2i', inputImageName: 'source.png', denoise: 0, cfg: 0 });
  const sampler = Object.values(graph).find(node => node.class_type === 'KSampler');
  assert.equal(sampler.inputs.denoise, 0);
  assert.equal(sampler.inputs.cfg, 0);
});

test('Стек из 12 LoRA совместим с Face Swap без перезаписи узлов модели', () => {
  const graph = compileWorkflow({
    ...base, loras: Array.from({ length: 12 }, (_, i) => ({ name: `lora${i}`, strength: 1 })),
    reactorToggle: true, reactorImageName: 'face.png',
  });
  let link = Object.values(graph).find(node => node.class_type === 'KSampler').inputs.model;
  for (let i = 0; i < 12; i++) {
    assert.equal(graph[link[0]].class_type, 'LoraLoader');
    link = graph[link[0]].inputs.model;
  }
  assert.equal(graph[link[0]].class_type, 'CheckpointLoaderSimple');
});

test('Базовый граф эквивалентен официальному API-примеру ComfyUI', async () => {
  const { readFile } = await import('node:fs/promises');
  const reference = JSON.parse(await readFile(new URL('./reference-api-workflow.json', import.meta.url), 'utf8'));
  const graph = compileWorkflow({ ...base, positive: reference['6'].inputs.text, negative: reference['7'].inputs.text });
  const expand = (workflow, id) => ({
    class_type: workflow[id].class_type,
    inputs: Object.fromEntries(Object.entries(workflow[id].inputs).filter(([key]) => key !== 'filename_prefix').map(([key, value]) =>
      [key, Array.isArray(value) ? [expand(workflow, value[0]), value[1]] : value])),
  });
  assert.deepEqual(expand(graph, '11'), expand(reference, '9'));
});
