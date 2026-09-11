import test from 'node:test';
import assert from 'node:assert/strict';
import { presentResourceMetrics } from '../resource_metrics.js';

test('Счётчики показывают память процесса и раскрывают состав VRAM', () => {
  const gib = 1024 ** 3;
  const view = presentResourceMetrics({
    process: { pid: 321, ram: { used: 3 * gib, capacity: 32 * gib } },
    devices: [{
      name: 'cuda:0 Test GPU',
      vram: { used: 6 * gib, capacity: 10 * gib, models: 4 * gib, working: 1 * gib, cache: 1 * gib, estimated: false },
    }],
  });

  assert.equal(view.ram.value, '3,0 ГБ');
  assert.equal(view.ram.percent, 9.375);
  assert.match(view.ram.title, /PID 321/);
  assert.equal(view.vram.value, '6,0 ГБ');
  assert.equal(view.vram.percent, 60);
  assert.equal(view.vram.detail, 'модели 4,0 · работа 1,0 · кэш 1,0 ГБ');
  assert.match(view.vram.title, /Comfy и PyTorch/);
});

test('Динамически загруженные модели помечаются как оценка', () => {
  const gib = 1024 ** 3;
  const view = presentResourceMetrics({
    process: { pid: 321, ram: { used: gib, capacity: 32 * gib } },
    devices: [{ name: 'GPU', vram: { used: 5 * gib, capacity: 10 * gib, models: 5 * gib, working: 0, cache: 0, estimated: true } }],
  });
  assert.equal(view.vram.value, '≈5,0 ГБ');
  assert.match(view.vram.title, /оценка/);
});
