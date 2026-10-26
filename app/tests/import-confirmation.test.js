import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {setupModelImport} from '../import.js';

test('Распознанная LoRA ждёт явного подтверждения и сохраняет выбранную категорию',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
  const {window}=dom,doc=window.document,keys=['document','window','Option','FormData','XMLHttpRequest','fetch'],originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const uploads=[];
  class Upload {
    upload={};
    open(){}
    send(data){uploads.push({kind:data.get('kind'),base:data.get('base'),category:data.get('category')});this.status=200;this.response={name:'Character/Illustrious/test.safetensors',path:'Lora/Character/Illustrious/test.safetensors'};queueMicrotask(()=>this.onload());}
  }
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  const responses=[];
  Object.assign(globalThis,{document:doc,window,Option:window.Option,FormData:window.FormData,XMLHttpRequest:Upload,fetch:async(url,options={})=>{
    responses.push(url);
    if(url==='/prism/import/analyze')return Response.json({kind:'loras',base:'Illustrious',category:'Other',categories:['Character','Other'],bases:['Illustrious'],trainingModel:'',evidence:{}});
    if(url==='/prism/lora-library/lookup')return Response.json({name:'Character/Illustrious/test.safetensors',title:'Test',metadataStatus:'complete',warning:''});
    if(url==='/prism/content')return Response.json({content:options.method==='POST'?JSON.parse(options.body).content:{},revision:'r1'});
    throw new Error(`Unexpected fetch: ${url}`);
  }});
  const waitFor=async predicate=>{for(let step=0;step<30&&!predicate();step++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
  const file={name:'test.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{}'}};
  try{
    setupModelImport(async()=>{});
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file],configurable:true});
    doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
    await waitFor(()=>!doc.querySelector('#import-fields').disabled);
    assert.equal(doc.querySelector('#import-save').disabled,true,'Неизвестное назначение требует выбора');
    assert.equal(uploads.length,0,'Анализ не сохраняет распознанный файл автоматически');
    doc.querySelector('[data-import-type="Style"]').click();
    assert.equal(doc.querySelector('#import-save').textContent,'Добавить стиль');
    doc.querySelector('#import-save').click();
    await waitFor(()=>uploads.length===1&&!doc.querySelector('#model-import-dialog').open);
    await waitFor(()=>responses.includes('/prism/lora-library/lookup'));
    assert.deepEqual(uploads[0],{kind:'loras',base:'Illustrious',category:'Style'});
  }finally{Object.assign(globalThis,originals);dom.window.close();}
});
