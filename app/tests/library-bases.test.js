import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Библиотека объединяет регистр базы и показывает импорт anima в фильтре Anima',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const model=(name,base)=>({name,title:name,base,version:'',author:'',tags:[],triggers:[],preview:'',description:'',url:''});
  let items=[model('Character/alice.safetensors','Anima'),model('Other/anima/slavya.safetensors','anima'),model('Other/ill.safetensors','Illustrious')];
  globalThis.fetch=async()=>Response.json({items});
  try{
    const {loadLoraLibrary}=await import('../library.js');
    await loadLoraLibrary();
    const select=document.getElementById('lora-library-base');
    assert.deepEqual([...select.options].map(option=>option.value),['all','Anima','Illustrious']);
    window.dispatchEvent(new CustomEvent('model-recipe-changed',{detail:{recipe:'anima'}}));
    assert.equal(select.value,'Anima');
    assert.equal(document.querySelectorAll('.library-card').length,2,'Фильтр включает и старую Anima, и импортированную anima');
    items=items.slice(1);await loadLoraLibrary();
    assert.equal(select.value,'anima','Обновление сохраняет выбранную базу при изменении регистра подписи');
    window.dispatchEvent(new Event('browse-loras'));
    assert.equal(select.value,'anima');
    assert.deepEqual([...document.querySelectorAll('.library-card')].map(card=>card.dataset.name),['Other/anima/slavya.safetensors']);
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
