
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('установленная полная модель выбирается в Создании с учётом путей Windows',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','Event','CustomEvent','Option','localStorage','Element','HTMLElement','matchMedia','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys)globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
  const name='Import Test\\full-model.safetensors';
  const info={CheckpointLoaderSimple:{input:{required:{ckpt_name:[[name]]}}}};
  globalThis.fetch=async()=>Response.json(info);
  try{
    const api=await import('../api.js');await api.fetchComfyInfo();
    const ui=await import('../ui.js');ui.syncModelLists();ui.setupUIEventListeners();
    await import('../main.js');
    document.body.dataset.appView='editor';
    window.dispatchEvent(new CustomEvent('prism-import-completed',{detail:{modelKind:'checkpoints',source:{name:'Import Test/full-model.safetensors'}}}));
    assert.equal(document.body.dataset.appView,'generation');
    assert.equal(document.querySelector('#checkpoint-select').value,name);
    assert.match(document.querySelector('#dashboard-message').textContent,/выбрана для генерации/);
    window.dispatchEvent(new CustomEvent('prism-import-completed',{detail:{modelKind:'diffusion_models',source:{name:'unknown-model.safetensors'}}}));
    assert.match(document.querySelector('#dashboard-message').textContent,/совместимые компоненты/);
    assert.equal(document.querySelector('#checkpoint-select').value,name,'Неподдерживаемый рецепт не подменяет рабочую модель');
  }finally{for(const key of keys)globalThis[key]=originals[key];dom.window.close();}
});
