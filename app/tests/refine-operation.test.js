import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefineSubmission } from '../refine.js';


test('Refine формирует самостоятельную операцию над выбранным output', () => {
  const result = createRefineSubmission({
    settings: {
      recipe: 'checkpoint',
      checkpoint: 'model.safetensors',
      width: 512,
      height: 512,
      batchCount: 4,
      batchLayout: 'square-v1',
      seed: 42,
      steps: 20,
      cfg: 6,
      sampler: 'euler',
      scheduler: 'normal',
      positive: 'portrait',
      negative: 'blurry',
      loras: [],
      character: null,
      hiresScale: 1.5,
      hiresDenoise: 0.35,
      upscaleSelect: '4x-UltraSharp.pth',
      variationStrength: 0.2,
      faceToggle: true,
      upscaleToggle: true,
      reactorToggle: true,
    },
    source: {
      filename: 'frame.png',
      subfolder: 'Prism',
      type: 'output',
      width: 1024,
      height: 768,
    },
  });

  assert.equal(result.settings.operation, 'refine');
  assert.equal(result.settings.batchCount, 1);
  assert.equal(result.settings.width, 1024);
  assert.equal(result.settings.height, 768);
  assert.deepEqual(result.settings.sourceImage, {
    filename: 'frame.png', subfolder: 'Prism', type: 'output',
  });
  assert.equal(result.settings.variationStrength, 0);
  assert.equal(result.settings.faceToggle, false);
  assert.equal(result.settings.upscaleToggle, false);
  assert.equal(result.settings.reactorToggle, false);
  assert.equal(Object.values(result.workflow).find(node => node.class_type === 'LoadImageOutput').inputs.image, 'Prism/frame.png [output]');
  assert.equal(Object.values(result.workflow).some(node => node.class_type === 'EmptyLatentImage'), false);
});
