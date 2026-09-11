import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { ComfyClient } from '../api.js';
import { validateCapabilities } from '../model_loader.js';
import { compileWorkflow } from '../workflow.js';

const baseUrl = 'http://127.0.0.1:8188';
const destination = '.cache/verification';
const optionalPasses = process.argv.includes('--optional');
const settings = {
  recipe: 'anima',
  checkpoint: 'anima-aesthetic-v1.1.safetensors',
  clipName: 'qwen_3_06b_base.safetensors',
  vaeName: 'qwen_image_vae.safetensors',
  seed: 20260910,
  width: optionalPasses ? 512 : 896,
  height: optionalPasses ? 640 : 1152,
  batchCount: 1,
  batchLayout: 'square-v1',
  steps: 30,
  cfg: 4,
  sampler: 'er_sde',
  scheduler: 'simple',
  positive: '1girl, solo, long dark hair, blue eyes, black coat, medium shot. She is standing beneath a stone arch during light snowfall. Warm window light illuminates her face while the distant street remains cold and softly blurred.',
  negative: '',
  loras: [],
  advancedToggle: false,
  hiresToggle: optionalPasses,
  hiresScale: 1.5,
  hiresDenoise: 0.35,
  upscaleSelect: '4x-UltraSharp.pth',
  faceToggle: optionalPasses,
  faceThreshold: 0.35,
  faceSteps: 12,
  upscaleToggle: false,
  reactorToggle: false,
  filenamePrefix: `PrismVerification/anima-aesthetic-v1.1${optionalPasses ? '-hires-face' : ''}`,
};

await mkdir(destination, { recursive: true });
const info = await (await fetch(`${baseUrl}/object_info`)).json();
const workflow = compileWorkflow(settings);
validateCapabilities(workflow, info);

const client = new ComfyClient({ baseUrl, storage: null, pollMs: 0 });
const started = Date.now();
await client.submit(workflow, settings);
while (client.busy && Date.now() - started < 20 * 60 * 1000) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  await client.reconcile();
  process.stdout.write(`\r${client.job.status} · ${Math.round((Date.now() - started) / 1000)} s`);
}
process.stdout.write('\n');
await writeFile(`${destination}/anima-live${optionalPasses ? '-hires-face' : ''}.json`, JSON.stringify(client.job, null, 2));
assert.equal(client.job.status, 'succeeded', client.job.error ?? 'Anima generation timed out');
assert.equal(client.job.outputs.length, 1);
console.log(JSON.stringify({
  promptId: client.job.promptId,
  seconds: (client.job.finishedAt - started) / 1000,
  output: client.job.outputs[0],
}));
