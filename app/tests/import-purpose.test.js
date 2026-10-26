import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('LoRA персонажа открывает понятную форму и сохраняет готовую карточку с внешностью и одеждой',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','FormData','XMLHttpRequest','localStorage','fetch'];
  const original=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>!['fetch','XMLHttpRequest'].includes(key)))globalThis[key]=key==='window'?dom.window:dom.window[key];
  const doc=dom.window.document;
  let characters={Katya:{name:'Katya',universe:'Tiny Bunny',lora:'None'},Duplicate:{name:'Duplicate',universe:'tiny bunny',lora:'None'},Other:{name:'Other',universe:'Original',lora:'None'}},writes=0,uploads=0,completed;
  dom.window.localStorage.setItem('prism_preferences_v1',JSON.stringify({autoCivitaiMetadata:false}));
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  class Upload {upload={};open(){} send(){uploads++;this.status=200;this.response={name:'Character/Illustrious/marceline.safetensors',path:'test-model'};queueMicrotask(()=>this.onload());}}
  globalThis.XMLHttpRequest=Upload;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/characters'){
      if(options.method==='POST'){characters=JSON.parse(options.body).characters;writes++;}
      return Response.json({characters,revision:'r'+writes});
    }
    if(url==='/prism/import/analyze')return Response.json({kind:'loras',base:'Illustrious',title:'Марселин',category:'Character',categories:['Character','Style','Other'],bases:['Illustrious'],evidence:{}});
    throw new Error('Unexpected request: '+url);
  };
  const wait=async predicate=>{for(let n=0;n<40&&!predicate();n++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  try{
    const {initCharacters}=await import('../characters.js');await initCharacters();
    const {setupModelImport}=await import('../import.js');setupModelImport(async()=>{});
    const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
    const file={name:'marceline.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{}'}};
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file]});
    doc.querySelector('#model-import-file').dispatchEvent(new dom.window.Event('change'));
    await wait(()=>!doc.querySelector('#import-save').disabled);
    assert.equal(doc.querySelector('#model-import-title').textContent,'Добавить персонажа');
    assert.doesNotMatch(doc.querySelector('#model-import-dialog').textContent,/Создать новую сущность|Оставить во входящих|Привязать к существующей/);
    assert.equal(doc.querySelector('#import-content-name').value,'Марселин');
    assert.equal(doc.querySelector('#import-save').textContent,'Добавить персонажа');
    const universe=doc.querySelector('#import-universe');
    assert.equal(universe.getAttribute('role'),'combobox','Вселенная использует существующий селектор со свободным вводом');
    doc.querySelector('[aria-label="Выбрать: Вселенная"]').click();
    assert.deepEqual([...doc.querySelectorAll('#import-universe-options [role="option"]')].map(option=>option.textContent),['Original','Tiny Bunny']);
    universe.value='tiny';universe.dispatchEvent(new dom.window.Event('input'));
    assert.deepEqual([...doc.querySelectorAll('#import-universe-options [role="option"]')].map(option=>option.textContent),['Tiny Bunny']);
    doc.querySelector('#import-universe-options [role="option"]').click();
    assert.equal(universe.value,'Tiny Bunny','Можно выбрать подсказку из библиотеки');
    universe.value='Время приключений';

    doc.querySelector('#import-appearance').value='long black hair, grey skin';
    doc.querySelector('#import-outfit').value='red shirt, jeans';
    doc.querySelector('#import-trigger').value='marceline';
    assert.equal(uploads,0);
    window.addEventListener('prism-import-completed',event=>{completed=event.detail;});
    doc.querySelector('#import-save').click();await wait(()=>completed);
    assert.equal(uploads,1);assert.equal(writes,1);
    assert.equal(characters['Марселин'].universe,'Время приключений');
    assert.equal(characters['Марселин'].appearance,'long black hair, grey skin');
    assert.equal(characters['Марселин'].trigger,'marceline');
    assert.equal(characters['Марселин'].outfits['По умолчанию'],'red shirt, jeans');
    assert.equal(completed.characterName,'Марселин');
    assert.equal(doc.querySelector('#model-import-dialog').open,false);
  }finally{Object.assign(globalThis,original);dom.window.close();}
});
