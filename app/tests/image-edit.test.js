import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ComfyClient} from '../api.js';
import {createEditSubmission} from '../image_edit_workflow.js';
import {validateCapabilities} from '../model_loader.js';

const info = JSON.parse(await readFile(new URL('./fixtures/image-edit-info.json', import.meta.url), 'utf8'));

test('Редактор отправляет исходник и одежду в Qwen 2.1, сохраняя инструкцию и seed задания', async () => {
  const submission = createEditSubmission({sourceImage:'person.png', referenceImage:'shirt.png', prompt:'Put the shirt from <image2> on <image1>.', quality:'draft', seed:42}, info);
  let sent;
  const client=new ComfyClient({storage:null,pollMs:0,fetchImpl:async (_url,options) => {
    sent=JSON.parse(options.body);
    return Response.json({prompt_id:sent.prompt_id});
  }});
  await client.submit(submission.workflow,submission.settings);
  assert.equal(sent.prompt['7'].inputs['images.image_1'][0],'5');
  assert.equal(sent.prompt['7'].inputs['images.image_2'][0],'6');
  assert.equal(sent.prompt['7'].inputs.resolution,512);
  assert.equal(sent.prompt['8'].inputs.steps,8);
  assert.equal(sent.prompt['8'].inputs.seed,42);
  assert.equal(sent.prompt['4'].inputs.device,'cpu');
  const adapter=sent.prompt[sent.prompt['4'].inputs.model[0]];
  assert.equal(adapter.class_type,'LoraLoaderModelOnly');
  assert.deepEqual(adapter.inputs.model,['1',0]);
  assert.equal(adapter.inputs.lora_name,'QwenImage21\\qwen-image-2.1-consistency.safetensors');
  assert.equal(adapter.inputs.strength_model,1);
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.stabilityLora,'consistency');
  assert.deepEqual(sent.extra_data.extra_pnginfo.matrix.settings.editLora,{name:adapter.inputs.lora_name,strength:1});
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.operation,'image-edit');
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.positive,'Put the shirt from <image2> on <image1>.');
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.editSourceImage,'person.png');
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.sourceImage,undefined,'Загруженное фото не становится output-артом галереи');
});

test('Продолжение редактирования сохраняет связь с исходным output-артом галереи', () => {
  const {settings,workflow}=createEditSubmission({sourceImage:'Prism/Edit_00001_.png [output]',prompt:'Change the jacket.',seed:1},info);
  assert.deepEqual(settings.sourceImage,{filename:'Edit_00001_.png',subfolder:'Prism',type:'output'});
  assert.equal(workflow['5'].inputs.image,'Prism/Edit_00001_.png [output]');
});

test('Локальная правка отправляет маску в Crop и возвращает результат через Stitch в исходный кадр', () => {
  const {workflow,settings}=createEditSubmission({sourceImage:'person.png',maskImage:'mask.png',prompt:'Replace the shirt.',seed:7},info);
  assert.equal(workflow['11'].inputs.channel,'red');
  assert.equal(workflow['12'].inputs.mask_blend_pixels,16);
  assert.equal(workflow['12'].inputs.preresize,false);
  assert.deepEqual(workflow['7'].inputs['images.image_1'],['12',1]);
  assert.deepEqual(workflow['13'].inputs.stitcher,['12',0]);
  assert.deepEqual(workflow['10'].inputs.images,['15',0]);
  assert.deepEqual(workflow['15'].inputs.original,['14',2]);
  assert.equal(settings.maskImage,'mask.png');
});

test('Prism проверяет штатные динамические входы изображений Qwen перед отправкой', () => {
  const {workflow}=createEditSubmission({sourceImage:'person.png',referenceImage:'shirt.png',prompt:'Change the shirt.',seed:1},info);
  assert.doesNotThrow(()=>validateCapabilities(workflow,info));
  workflow['7'].inputs['images.image_17']=['5',0];
  assert.throws(()=>validateCapabilities(workflow,info),/не поддерживается/);
});

test('Выбранная Outfit Swap передаётся в запрос локальной правки без изменения энкодера и защиты кадра', async () => {
  const portableInfo=structuredClone(info);
  portableInfo.LoraLoaderModelOnly.input.required.lora_name[0]=['QwenImage21/qwen-image-2.1-outfit-swap.safetensors'];
  const {workflow,settings}=createEditSubmission({sourceImage:'person.png',maskImage:'mask.png',prompt:'Replace the shirt.',seed:42,stabilityLora:'outfit-swap'},portableInfo);
  let sent;
  const client=new ComfyClient({storage:null,pollMs:0,fetchImpl:async (_url,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({prompt_id:sent.prompt_id});
  }});
  await client.submit(workflow,settings);
  const adapter=sent.prompt[sent.prompt['4'].inputs.model[0]];
  assert.equal(adapter.inputs.lora_name,'QwenImage21/qwen-image-2.1-outfit-swap.safetensors');
  assert.equal(adapter.inputs.strength_model,1);
  assert.deepEqual(sent.prompt['7'].inputs.clip,['2',0]);
  assert.equal(sent.prompt['2'].class_type,'CLIPLoader');
  assert.deepEqual(sent.prompt['10'].inputs.images,['15',0]);
  assert.equal(sent.extra_data.extra_pnginfo.matrix.settings.stabilityLora,'outfit-swap');
  assert.doesNotThrow(()=>validateCapabilities(sent.prompt,portableInfo));
});

test('Отсутствующая или неизвестная LoRA не подменяется другим адаптером',()=>{
  const missingInfo=structuredClone(info);
  missingInfo.LoraLoaderModelOnly.input.required.lora_name[0]=['QwenImage21/qwen-image-2.1-outfit-swap.safetensors'];
  const options={sourceImage:'person.png',prompt:'Replace the shirt.',seed:42};
  assert.throws(()=>createEditSubmission(options,missingInfo),/qwen-image-2\.1-consistency\.safetensors/);
  assert.throws(()=>createEditSubmission({...options,stabilityLora:'other'},info),/Выберите LoRA стабильности/);
});
