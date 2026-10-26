import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {setupModelImport} from '../import.js';

test('Неизвестная база вводится своим именем; следующий импорт предлагает только сохранённые базы',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
  const {window}=dom,doc=window.document,keys=['document','window','Option','FormData','XMLHttpRequest','fetch'],originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const sent=[],known=[],lookups=[];let content={};
  class Upload {
    upload={};
    open(){}
    send(data){const base=data.get('base');sent.push({base,category:data.get('category'),civitai:data.get('civitai')});if(!known.includes(base))known.push(base);this.status=200;this.response={name:'Other/'+base+'/test.safetensors',path:'Lora/Other/'+base+'/test.safetensors'};queueMicrotask(()=>this.onload());}
  }
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  Object.assign(globalThis,{document:doc,window,Option:window.Option,FormData:window.FormData,XMLHttpRequest:Upload,fetch:async(url,options={})=>{
    if(url==='/prism/lora-library/lookup'){lookups.push(JSON.parse(options.body));return Response.json({title:'Test',metadataStatus:'complete',warning:''});}
    if(url==='/prism/content'){if(options.method==='POST')content=JSON.parse(options.body).content;return Response.json({content,revision:'r1'});}
    return Response.json({kind:'loras',base:null,category:null,categories:['Character','Other'],bases:[...known],trainingModel:'',evidence:{}});
  }});
  const waitFor=async predicate=>{for(let step=0;step<30&&!predicate();step++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  const open=()=>{
    const header='{}',prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
    const file={name:'test.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>header}};
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file],configurable:true});
    doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
  };
  try{
    setupModelImport(async()=>{});open();await waitFor(()=>!doc.querySelector('#import-fields').disabled);
    const base=doc.querySelector('#import-base');
    assert.equal(base.tagName,'INPUT','Тот же редактируемый селектор, что в библиотеке');
    assert.equal(base.value,'');assert.equal(sent.length,0,'Неизвестную базу не выбираем сами');
    assert.equal(doc.querySelector('#import-save').disabled,true);
    assert.equal(doc.querySelector('#import-purpose-picker').hidden,false);
    doc.querySelector('[data-import-type="Style"]').click();
    base.value='Illustrious';base.dispatchEvent(new window.Event('change'));
    doc.querySelector('#import-save').click();await waitFor(()=>sent.length===1&&lookups.length===1&&!doc.querySelector('#import-cancel').disabled);
    assert.deepEqual(sent[0],{base:'Illustrious',category:'Style',civitai:null},'Сеть Civitai не блокирует сохранение файла');
    assert.deepEqual(lookups[0],{name:'Other/Illustrious/test.safetensors'});
    await waitFor(()=>!doc.querySelector('#model-import-dialog').open);
    doc.querySelector('#import-cancel').click();open();await waitFor(()=>!doc.querySelector('#import-fields').disabled);
    doc.querySelector('[aria-label="Выбрать: Базовая модель"]').click();
    assert.deepEqual([...doc.querySelectorAll('#import-base-options [role="option"]')].map(option=>option.textContent),['Illustrious']);
    doc.querySelector('#import-base-options [role="option"]').click();
    assert.equal(base.value,'Illustrious');assert.equal(sent.length,1,'Выбор базы не запускает импорт до подтверждения');
    doc.querySelector('[data-import-type="Style"]').click();
    doc.querySelector('#import-content-name').value='Другой стиль';
    assert.match(doc.querySelector('#import-destination').textContent,/карточка в библиотеке/);
    window.localStorage.setItem('prism_preferences_v1',JSON.stringify({autoCivitaiMetadata:false}));
    doc.querySelector('#import-save').click();await waitFor(()=>sent.length===2&&!doc.querySelector('#import-cancel').disabled);
    assert.equal(sent[1].civitai,null,'Настройка метаданных не меняет контракт загрузки файла');
    assert.equal(lookups.length,1,'Отключённая опция не запускает отдельный поиск Civitai');
    doc.querySelector('#import-cancel').click();
  }finally{Object.assign(globalThis,originals);dom.window.close();}
});
