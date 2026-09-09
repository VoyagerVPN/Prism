import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelCatalog, validateCapabilities } from '../model_loader.js';

test('Отдельные diffusion models не выдаются за поддерживаемые checkpoint', () => {
  const info = {
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [['present.safetensors']] } } },
    UNETLoader: { input: { required: { unet_name: [['anima.safetensors', 'wan.safetensors']] } } },
  };
  assert.deepEqual(buildModelCatalog(info), [{ name: 'present.safetensors', recipe: 'checkpoint' }]);
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
