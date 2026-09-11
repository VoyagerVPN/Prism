import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceProgress, createProgress, describeProgress } from '../progress.js';

const workflow = {
  model: { class_type: 'CheckpointLoaderSimple', inputs: {} },
  first: { class_type: 'KSampler', inputs: { model: ['model', 0], steps: 20, denoise: 1 } },
  scale: { class_type: 'ImageScale', inputs: { image: ['first', 0] } },
  second: { class_type: 'KSampler', inputs: { latent_image: ['scale', 0], steps: 20, denoise: 0.5 } },
  save: { class_type: 'SaveImage', inputs: { images: ['second', 0] } },
};

test('Общий прогресс не откатывается при переходе к следующему sampler-проходу', () => {
  let progress = createProgress(workflow);
  progress = advanceProgress(progress, workflow, 'execution_cached', { nodes: ['model'] });
  progress = advanceProgress(progress, workflow, 'executing', { node: 'first' });
  progress = advanceProgress(progress, workflow, 'progress', { node: 'first', value: 20, max: 20 });
  const afterFirstPass = progress.percent;

  progress = advanceProgress(progress, workflow, 'executing', { node: 'scale' });
  progress = advanceProgress(progress, workflow, 'executing', { node: 'second' });
  const atSecondPassStart = progress.percent;
  progress = advanceProgress(progress, workflow, 'progress', { node: 'second', value: 1, max: 10 });

  assert.ok(afterFirstPass > 0);
  assert.ok(atSecondPassStart >= afterFirstPass);
  assert.ok(progress.percent >= atSecondPassStart);
  assert.match(describeProgress(progress, workflow, { batchCount: 1 }).detail, /Проход 2\/2/);
});

test('Прогресс различает кадры серии и сохраняет уже завершённую работу', () => {
  const series = {
    frame_0_7: { class_type: 'KSampler', inputs: { steps: 10, denoise: 1 } },
    frame_0_11: { class_type: 'SaveImage', inputs: { images: ['frame_0_7', 0] } },
    frame_1_7: { class_type: 'KSampler', inputs: { steps: 10, denoise: 1 } },
    frame_1_11: { class_type: 'SaveImage', inputs: { images: ['frame_1_7', 0] } },
  };
  let progress = createProgress(series);
  progress = advanceProgress(progress, series, 'executing', { node: 'frame_0_7' });
  progress = advanceProgress(progress, series, 'progress', { node: 'frame_0_7', value: 10, max: 10 });
  progress = advanceProgress(progress, series, 'executing', { node: 'frame_0_11' });
  progress = advanceProgress(progress, series, 'executing', { node: 'frame_1_7' });
  const beforeNewFrameStep = progress.percent;
  progress = advanceProgress(progress, series, 'progress', { node: 'frame_1_7', value: 1, max: 10 });
  const presentation = describeProgress(progress, series, { batchCount: 2 });

  assert.ok(progress.percent >= beforeNewFrameStep);
  assert.equal(presentation.label, 'Кадр 2/2 · Диффузия');
  assert.match(presentation.detail, /Общий прогресс \d+%/);
});
