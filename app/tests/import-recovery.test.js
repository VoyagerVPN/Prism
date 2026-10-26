
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

async function scenario(options,check){
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const {window}=dom,doc=window.document,keys=['window','document','CustomEvent','Event','Option','FormData','XMLHttpRequest','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>!['fetch','XMLHttpRequest'].includes(key)))globalThis[key]=key==='window'?window:window[key];
  window.localStorage.setItem('prism_preferences_v1',JSON.stringify({autoCivitaiMetadata:false}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  let uploads=0,writes=0,content={},characters=options.characters??{},completed=null;
  globalThis.XMLHttpRequest=class {upload={};open(){}send(){uploads++;this.status=200;this.response={name:'test/model.safetensors',path:'test/model'};queueMicrotask(()=>this.onload());}};
  globalThis.fetch=async(url,request={})=>{
    if(url==='/prism/import/analyze')return Response.json({kind:'loras',base:'Illustrious',category:'Other',bases:['Illustrious'],...options.analysis});
    if(url==='/prism/characters'){
      if(request.method==='POST'){writes++;characters=JSON.parse(request.body).characters;}
      return Response.json({characters,revision:'r'+writes});
    }
    if(url==='/prism/content'){
      if(request.method==='POST'){
        writes++;if(options.failFirst&&writes===1)return Response.json({error:'Хранилище занято'},{status:503});
        content=JSON.parse(request.body).content;
      }
      return Response.json({content,revision:'r'+writes});
    }
    throw new Error('Unexpected '+url);
  };
  const wait=async predicate=>{for(let n=0;n<80&&!predicate();n++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  try{
    const {initCharacters}=await import('../characters.js');await initCharacters();
    await (await import('../content_registry.js')).loadContentRegistry({force:true});
    (await import('../import.js')).setupModelImport(async()=>{});
    window.addEventListener('prism-import-completed',event=>{completed=event.detail;});
    const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[{name:'sample.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{}'}}]});
    doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
    await wait(()=>!doc.querySelector('#import-fields').disabled);
    await check({doc,window,wait,stats:()=>({uploads,writes,content,characters,completed})});
  }finally{Object.assign(globalThis,originals);window.close();}
}

test('неизвестная LoRA требует назначения, а ошибка записи повторяет только сохранение карточки',()=>scenario({failFirst:true},async({doc,wait,stats})=>{
  assert.equal(doc.querySelector('#import-purpose-picker').hidden,false);
  assert.equal(doc.querySelector('#import-save').disabled,true);
  assert.equal(stats().uploads,0);
  doc.querySelector('[data-import-type="Style"]').click();
  doc.querySelector('#import-trigger').value='soft lighting';
  doc.querySelector('#import-save').click();
  await wait(()=>doc.querySelector('#import-status').textContent.includes('Хранилище занято'));
  assert.equal(doc.querySelector('#model-import-dialog').open,true);
  assert.equal(doc.querySelector('#import-save').textContent,'Повторить сохранение карточки');
  assert.equal(stats().uploads,1);
  doc.querySelector('#import-save').click();await wait(()=>stats().completed);
  assert.equal(stats().uploads,1);assert.equal(stats().writes,2);
  assert.equal(Object.values(stats().content).length,1);
  assert.equal(stats().completed.contentType,'Style');
  doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
  await wait(()=>!doc.querySelector('#import-fields').disabled);
  assert.equal(doc.querySelector('#import-kind').disabled,false);
  assert.equal(doc.querySelector('#import-base').disabled,false,'Следующий импорт снова позволяет выбрать базу');
}));

test('подключение модели к персонажу предупреждает о замене и сохраняет внешность',()=>scenario({
  characters:{Mira:{name:'Mira',lora:'old.safetensors',appearance:'silver hair',outfits:{Обычно:'navy coat'},activeOutfitName:'Обычно',strength:0.8}},
  analysis:{category:'Character',entities:[{id:'character:mira',type:'Character',name:'Mira',characterName:'Mira'},{id:'character:source',type:'Character',name:'Файл без персонажа'},{id:'style:other',type:'Style',name:'Свет'}]}
},async({doc,window,wait,stats})=>{
  doc.querySelector('#import-attach').click();
  assert.deepEqual([...doc.querySelector('#import-entity-target').options].map(item=>item.textContent),['Выберите…','Mira']);
  const select=doc.querySelector('#import-entity-target');select.value='character:mira';select.dispatchEvent(new window.Event('change'));
  assert.match(doc.querySelector('#import-target-note').textContent,/заменит прежнюю/);
  assert.equal(doc.querySelector('#import-save').textContent,'Заменить модель персонажа');
  doc.querySelector('#import-save').click();await wait(()=>stats().completed);
  assert.equal(stats().characters.Mira.appearance,'silver hair');
  assert.equal(stats().characters.Mira.outfits.Обычно,'navy coat');
  assert.equal(stats().characters.Mira.lora,'test/model.safetensors');
  assert.equal(stats().completed.characterName,'Mira');
}));

test('полная модель открывает установку модели без полей персонажа и записи контента',()=>scenario({analysis:{kind:'checkpoints',category:null}},async({doc,wait,stats})=>{
  assert.equal(doc.querySelector('#model-import-title').textContent,'Добавить модель');
  assert.equal(doc.querySelector('#import-purpose').hidden,true);
  assert.equal(doc.querySelector('#import-card-fields').hidden,true);
  doc.querySelector('#import-save').click();await wait(()=>stats().completed);
  assert.equal(stats().uploads,1);assert.equal(stats().writes,0);
  assert.equal(stats().completed.modelKind,'checkpoints');
}));
