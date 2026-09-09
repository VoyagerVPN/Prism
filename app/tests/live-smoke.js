import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { compileWorkflow } from '../workflow.js';
import { validateCapabilities, comboValues } from '../model_loader.js';
import { ComfyClient, uploadI2IImage, imageUrl } from '../api.js';

const destination = '.cache/verification';
await mkdir(destination, { recursive: true });
const info = await (await fetch('http://127.0.0.1:8188/object_info')).json();
const reference = JSON.parse(await readFile('tests/reference-api-workflow.json', 'utf8'));
const base = { recipe: 'checkpoint', checkpoint: reference['4'].inputs.ckpt_name, seed: 12345, mode: 't2i', width: 1024, height: 1024, batchCount: 1, steps: 20, cfg: 6, sampler: 'euler', scheduler: 'normal', positive: reference['6'].inputs.text, negative: reference['7'].inputs.text, loras: [] };
const client = new ComfyClient({ storage: null, pollMs: 0 });
const results = [];
async function check(name, changes) {
  const settings = { ...base, ...changes, filenamePrefix: `MatrixVerification/${name}` };
  const workflow = compileWorkflow(settings);
  validateCapabilities(workflow, info);
  const started = Date.now();
  await client.submit(workflow, settings);
  while (client.busy && Date.now() - started < 600000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await client.reconcile();
  }
  await writeFile(`${destination}/${name}.json`, JSON.stringify(client.job, null, 2));
  assert.equal(client.job.status, 'succeeded', `${name}: ${client.job.error}`);
  assert.equal(client.job.outputs.length, settings.batchCount);
  const result = { name, promptId: client.job.promptId, seconds: (Date.now() - started) / 1000, outputs: client.job.outputs };
  results.push(result);
  await writeFile(`${destination}/live-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(result));
  return client.job.outputs[0];
}
const source = await check('dashboard-baseline', {});
const sourceBlob = await (await fetch(imageUrl(source))).blob();
const sourceName = await uploadI2IImage(new File([sourceBlob], 'reference.png', { type: 'image/png' }));
const loras = comboValues(info.LoraLoader.input.required.lora_name);
console.log('LoRAs: '+JSON.stringify(loras));
await check('lora-character', { character: { name: 'Smoke', appearance: 'blue eyes', outfitEnabled: false, lora: loras.find(name => name.includes('Utility')) ?? loras[0], strength: 0.5 }, advancedToggle: true, clipSkip: 2 });
await check('img2img', { mode: 'i2i', inputImageName: sourceName, denoise: 0.25, batchCount: 4 });
await check('hires', { width: 512, height: 512, steps: 10, hiresToggle: true, hiresScale: 1.5, hiresDenoise: 0.3, upscaleSelect: '4x-UltraSharp.pth' });
await check('upscale', { width: 512, height: 512, steps: 10, upscaleToggle: true, upscaleSelect: '4x-UltraSharp.pth' });
await check('refine', { mode: 'i2i', operation: 'refine', inputImageName: sourceName, width: 1536, height: 1536, denoise: 0.25, upscaleSelect: '4x-UltraSharp.pth' });
await check('face-detailer', { faceToggle: true, faceThreshold: 0.4, faceSteps: 10 });
await check('reactor', { reactorToggle: true, reactorImageName: sourceName, reactorRestore: 'none' });

