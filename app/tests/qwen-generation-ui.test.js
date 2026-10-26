import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('В Создании пользователь выбирает Qwen и получает подходящие параметры и пояснение CFG',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','Event','CustomEvent','Option','localStorage','Element','HTMLElement','matchMedia','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys)globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
  const info=JSON.parse(await readFile(new URL('./fixtures/image-edit-info.json',import.meta.url),'utf8'));
  info.EmptyLatentImage={input:{required:{}},output:['LATENT']};
  globalThis.fetch=async()=>Response.json(info);
  try{
    const api=await import('../api.js');await api.fetchComfyInfo();
    const ui=await import('../ui.js');ui.syncModelLists();ui.setupUIEventListeners();
    const select=document.getElementById('checkpoint-select');
    select.value='qwen_image_2.1_int8_convrot.safetensors';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    assert.equal(document.getElementById('steps-slider').value,'25');
    assert.equal(document.getElementById('cfg-slider').value,'1');
    assert.equal(document.getElementById('sampler-select').value,'euler');
    assert.equal(document.getElementById('scheduler-select').value,'simple');
    assert.match(document.getElementById('model-recipe-hint').textContent,/Qwen.*INT8/);
    assert.match(document.getElementById('negative-prompt-hint').textContent,/CFG 1.*не влияет/);
  }finally{for(const key of keys)globalThis[key]=originals[key];dom.window.close();}
});
