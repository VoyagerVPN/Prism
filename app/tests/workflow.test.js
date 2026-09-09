import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflow } from '../workflow.js';

const base = {
  recipe: 'checkpoint', checkpoint: 'novaKemonoXL_v80.safetensors',
  width: 1024, height: 1024, batchCount: 1,
  seed: 12345, steps: 20, cfg: 6, sampler: 'euler', scheduler: 'normal',
  positive: 'portrait', negative: 'blurry', loras: [], character: null,
};

test('Inline LoRA отделяются от текста, сохраняют веса и не дублируют LoRA персонажа',()=>{
  const graph=compileWorkflow({...base,positive:'stale',loras:[{name:'stale.safetensors',strength:1}],positiveParts:[{type:'text',text:'portrait '},{type:'lora',name:'Style/light.safetensors',strength:-0.4},{type:'text',text:'at night'},{type:'lora',name:'Character/hero.safetensors',strength:0.9}],character:{lora:'Character\\hero.safetensors',strength:0.6}});
  assert.equal(graph['5'].inputs.text,'portrait at night');assert.equal(graph['6'].inputs.text,'blurry');
  const loaders=Object.values(graph).filter(node=>node.class_type==='LoraLoader');
  assert.equal(loaders.length,2);assert.equal(loaders[0].inputs.strength_model,0.6);assert.equal(loaders[1].inputs.strength_model,-0.4);
  assert.equal(loaders[1].inputs.strength_clip,-0.4);assert.equal(loaders[1].inputs.lora_name,'Style/light.safetensors');
  for(const part of [{type:'lora',name:'x',strength:NaN},{type:'lora',name:'../x',strength:1},{type:'text',text:42}])assert.throws(()=>compileWorkflow({...base,positiveParts:[part]}));
});

test('Варианты внешности и одежды независимы, общий триггер остаётся в каждом промпте',()=>{
  const character={name:'Герой',trigger:'hero_token',appearance:'old fallback',appearances:{День:'green eyes',Вечер:'red eyes'},activeAppearanceName:'День',outfits:{Обычный:'blue coat',Праздник:'red dress'},activeOutfitName:'Обычный',lora:'None'};
  for(const activeAppearanceName of ['День','Вечер'])for(const outfitEnabled of [true,false]) {
    const text=compileWorkflow({...base,character:{...character,activeAppearanceName,outfitEnabled}})['5'].inputs.text;
    assert.equal(text.split('hero_token').length-1,1);assert.match(text,activeAppearanceName==='День'?/green eyes/:/red eyes/);
    assert.doesNotMatch(text,activeAppearanceName==='День'?/red eyes|old fallback/:/green eyes|old fallback/);
    if(outfitEnabled)assert.match(text,/blue coat/);else assert.doesNotMatch(text,/blue coat/);
    assert.doesNotMatch(text,/red dress/);
  }
});

test('Персонаж с LoRA и без неё использует одинаковые внешность и выбранную одежду', () => {
  const character={name:'Персонаж',universe:'Neverland',description:'Secret notes',lora:'None',strength:0.7,appearance:'green eyes',outfits:{День:'blue coat',Вечер:'red dress'},activeOutfitName:'День',outfitEnabled:true};
  for(const lora of ['None','Character/test.safetensors']) {
    const graph=compileWorkflow({...base,character:{...character,lora}});
    assert.match(graph['5'].inputs.text,/green eyes/);
    assert.match(graph['5'].inputs.text,/blue coat/);
    assert.doesNotMatch(graph['5'].inputs.text,/red dress/);
    assert.doesNotMatch(graph['5'].inputs.text,/Neverland|Secret notes/);
    assert.equal(Object.values(graph).filter(node=>node.class_type==='LoraLoader').length,lora==='None'?0:1);
    const withoutOutfit=compileWorkflow({...base,character:{...character,lora,outfitEnabled:false}});
    assert.match(withoutOutfit['5'].inputs.text,/green eyes/);
    assert.doesNotMatch(withoutOutfit['5'].inputs.text,/blue coat|red dress/);
  }
});

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
