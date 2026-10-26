import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildModelCatalog,resolveModelSelection,validateCapabilities} from '../model_loader.js';
import {compileWorkflow} from '../workflow.js';
import {ComfyClient} from '../api.js';

const info=JSON.parse(await readFile(new URL('./fixtures/image-edit-info.json',import.meta.url),'utf8'));
info.EmptyLatentImage={input:{required:{width:['INT',{min:16,max:16384}],height:['INT',{min:16,max:16384}],batch_size:['INT',{min:1,max:4096}]}},output:['LATENT']};

test('Выбранный Qwen в Создании отправляет текст и размер в штатный INT8 pipeline ComfyUI',async()=>{
  const selection=resolveModelSelection(buildModelCatalog(info),'qwen_image_2.1_int8_convrot.safetensors');
  const settings={...selection,...selection.recommended,positive:'A ceramic teapot on a wooden table.',negative:'blur',width:768,height:512,seed:42,batchCount:1,operation:'txt2img'};
  const workflow=compileWorkflow(settings);
  validateCapabilities(workflow,info);
  let sent;
  const client=new ComfyClient({storage:null,pollMs:0,fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({prompt_id:sent.prompt_id});}});
  await client.submit(workflow,settings);
  const nodes=Object.values(sent.prompt);
  assert.equal(nodes.find(node=>node.class_type==='CLIPLoader').inputs.type,'qwen_image');
  const encoder=nodes.find(node=>node.class_type==='TextEncodeQwenImage21');
  assert.equal(encoder.inputs.prompt,settings.positive);
  assert.equal(encoder.inputs.negative_prompt,'blur');
  assert.equal(nodes.some(node=>node.class_type==='LoadImage'),false);
  const latent=nodes.find(node=>node.class_type==='EmptyLatentImage');
  assert.equal(latent.inputs.width,768);assert.equal(latent.inputs.height,512);
  const sampler=nodes.find(node=>node.class_type==='KSampler');
  assert.equal(sampler.inputs.cfg,1);assert.equal(sampler.inputs.steps,25);
  assert.equal(sampler.inputs.sampler_name,'euler');assert.equal(sampler.inputs.scheduler,'simple');
  assert.equal(sent.prompt[sampler.inputs.negative[0]].class_type,'TextEncodeQwenImage21');
  assert.equal(sampler.inputs.negative[1],1);
  assert.ok(nodes.some(node=>node.class_type==='VAEDecodeTiled'));
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.recipe,'qwen-image-2.1');
});

test('Сохранённые улучшения SDXL не отправляются в несовместимый Qwen pipeline',()=>{
  const settings={recipe:'qwen-image-2.1',checkpoint:'qwen_image_2.1_int8_convrot.safetensors',clipName:'qwen3vl_8b_int8_convrot.safetensors',vaeName:'qwen_image_2.1_vae_bf16.safetensors',positive:'A teapot.',width:512,height:512,seed:42,batchCount:1,upscaleSelect:'4x-UltraSharp.pth',reactorImageName:'face.png'};
  for(const option of ['hiresToggle','faceToggle','upscaleToggle','reactorToggle'])assert.throws(()=>compileWorkflow({...settings,[option]:true}),/Qwen 2.1.*редактор/);
});
