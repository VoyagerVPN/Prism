import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoraCompatibility, buildModelCatalog, loadModel, resolveModelSelection, validateCapabilities } from '../model_loader.js';

test('Отдельные diffusion models не выдаются за поддерживаемые checkpoint', () => {
  const info = {
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [['present.safetensors']] } } },
    UNETLoader: { input: { required: { unet_name: [['anima.safetensors', 'wan.safetensors']] } } },
  };
  assert.deepEqual(buildModelCatalog(info), [{ name: 'present.safetensors', recipe: 'checkpoint' }]);
});

test('Anima попадает в общий каталог только с официальными энкодером и VAE', () => {
  const info = {
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [['illustrious.safetensors']] } } },
    UNETLoader: { input: { required: { unet_name: [['anima-aesthetic-v1.1.safetensors', 'wan.safetensors']] } } },
    CLIPLoader: { input: { required: { clip_name: [['qwen_3_06b_base.safetensors']] } } },
    VAELoader: { input: { required: { vae_name: [['qwen_image_vae.safetensors']] } } },
  };
  assert.deepEqual(buildModelCatalog(info), [
    { name: 'illustrious.safetensors', recipe: 'checkpoint' },
    {
      name: 'anima-aesthetic-v1.1.safetensors', recipe: 'anima',
      clipName: 'qwen_3_06b_base.safetensors', vaeName: 'qwen_image_vae.safetensors',
    },
  ]);

  const withoutEncoder = structuredClone(info);
  withoutEncoder.CLIPLoader.input.required.clip_name = [[]];
  assert.match(buildModelCatalog(withoutEncoder)[1].reason, /qwen_3_06b_base/);
});

test('Anima загружает diffusion model, Qwen3 и Qwen-Image VAE отдельными узлами', () => {
  const graph = {};
  assert.deepEqual(loadModel(graph, {
    recipe: 'anima', checkpoint: 'anima-aesthetic-v1.1.safetensors',
    clipName: 'qwen_3_06b_base.safetensors', vaeName: 'qwen_image_vae.safetensors',
  }), { modelLink: ['1', 0], clipLink: ['2', 0], vaeLink: ['3', 0] });
  assert.deepEqual(graph, {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'anima-aesthetic-v1.1.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_06b_base.safetensors', type: 'stable_diffusion' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
  });
});

test('Выбор Anima передаёт в снимок задания её рецепт и стабильные настройки', () => {
  const catalog = [{
    name: 'anima-aesthetic-v1.1.safetensors', recipe: 'anima',
    clipName: 'qwen_3_06b_base.safetensors', vaeName: 'qwen_image_vae.safetensors',
  }];
  assert.deepEqual(resolveModelSelection(catalog, 'anima-aesthetic-v1.1.safetensors'), {
    checkpoint: 'anima-aesthetic-v1.1.safetensors', recipe: 'anima',
    clipName: 'qwen_3_06b_base.safetensors', vaeName: 'qwen_image_vae.safetensors',
    recommended: { steps: 30, cfg: 4, sampler: 'er_sde', scheduler: 'simple' },
  });
  assert.throws(() => resolveModelSelection(catalog, 'missing.safetensors'), /недоступна/);
});

test('Известная LoRA от другой архитектуры останавливает задание до отправки', () => {
  const details = {
    'Character/anima.safetensors': { base_model: 'anima' },
    'Character/illustrious.safetensors': { base_model: 'sdxl' },
    'Style/unknown.safetensors': { base_model: 'unknown' },
  };
  assert.doesNotThrow(() => assertLoraCompatibility('anima', [
    { name: 'Character\\anima.safetensors' }, { name: 'Style/unknown.safetensors' },
  ], details));
  assert.throws(() => assertLoraCompatibility('anima', [{ name: 'Character/illustrious.safetensors' }], details), /несовместима с Anima/);
  assert.throws(() => assertLoraCompatibility('checkpoint', [{ name: 'Character\\anima.safetensors' }], details), /только для Anima/);
});

test('Недоступная модель останавливает отправку вместо фиктивного fallback', () => {
  const info = { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['present.safetensors']] } }, output: ['MODEL', 'CLIP', 'VAE'] } };
  assert.throws(() => validateCapabilities({ loader: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'missing.safetensors' } } }, info), /missing.safetensors/);
  assert.throws(() => validateCapabilities({ face: { class_type: 'FaceDetailer', inputs: {} } }, info), /FaceDetailer/);
});

test('Списки COMBO нового API поддерживаются и проверяются перед отправкой', () => {
  const info = { CheckpointLoaderSimple: { input: { required: { ckpt_name: ['COMBO', { options: ['actual.safetensors'] }] } } } };
  assert.deepEqual(buildModelCatalog(info), [{ name: 'actual.safetensors', recipe: 'checkpoint' }]);
  assert.throws(() => validateCapabilities({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'missing.safetensors' } } }, info), /недоступно/);
});

test('Remote COMBO принимает output-файл, выбранный после получения object_info', () => {
  const info = {
    LoadImageOutput: {
      input: {required: {image: ['COMBO', {remote: {route: '/internal/files/output'}}]}},
      output: ['IMAGE', 'MASK'],
    },
  };
  assert.doesNotThrow(() => validateCapabilities({source: {
    class_type: 'LoadImageOutput',
    inputs: {image: 'Prism/frame.png [output]'},
  }}, info));
});
