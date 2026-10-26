import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {setupModelImport} from '../import.js';

test('импорт возвращает намерение привязать источник к существующей сущности',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
  const {window}=dom,doc=window.document,keys=['document','window','Option','FormData','XMLHttpRequest','fetch','CustomEvent'],originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const uploads=[],contentWrites=[];
  class Upload {
    upload={};open(){}
    send(data){uploads.push({category:data.get('category')});this.status=200;this.response={name:'Style/Illustrious/soft.safetensors',path:'Lora/Style/Illustrious/soft.safetensors'};queueMicrotask(()=>this.onload());}
  }
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  const target={id:'style:soft',type:'Style',name:'Мягкий стиль',scopes:['global'],bindings:[{kind:'prompt',positive:['soft lighting'],negative:[]}]};
  Object.assign(globalThis,{document:doc,window,Option:window.Option,FormData:window.FormData,XMLHttpRequest:Upload,CustomEvent:window.CustomEvent,fetch:async(url,options={})=>{
    if(url==='/prism/content'){
      if(options.method==='POST'){
        const body=JSON.parse(options.body);contentWrites.push(body);return Response.json({content:body.content,revision:'content-r1'});
      }
      return Response.json({content:{},revision:null});
    }
    return Response.json({kind:'loras',base:'Illustrious',category:'Style',categories:['Character','Style','Other'],bases:['Illustrious'],trainingModel:'',evidence:{},entities:[target]});
  }});
  const waitFor=async predicate=>{for(let step=0;step<30&&!predicate();step++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
  const file={name:'soft.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{}'}};
  let result;window.addEventListener('prism-content-imported',event=>{result=event.detail;});
  try{
    setupModelImport(async()=>{});
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file],configurable:true});
    doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
    await waitFor(()=>!doc.querySelector('#import-save').disabled);
    const target=doc.querySelector('#import-entity-target'),contentType=doc.querySelector('#import-content-type');
    assert.equal(doc.querySelector('#model-import-title').textContent,'Добавить стиль');
    assert.equal(doc.querySelector('#import-entity-mode'),null);
    doc.querySelector('#import-attach').click();
    assert.equal(doc.querySelector('#import-target-fields').hidden,false);
    assert.deepEqual([...target.options].map(option=>option.textContent),['Выберите…','Мягкий стиль']);
    assert.equal(doc.querySelector('#import-save').disabled,true,'Карточку нужно выбрать явно');
    target.value='style:soft';target.dispatchEvent(new window.Event('change'));
    assert.equal(contentType.value,'Style');
    doc.querySelector('#import-save').click();await waitFor(()=>result);
    assert.equal(uploads[0].category,'Style','старый upload API получает совместимую backend-категорию');
    assert.deepEqual({action:result.action,contentType:result.contentType,targetId:result.targetId,source:result.source},{action:'attach',contentType:'Style',targetId:'style:soft',source:{name:'Style/Illustrious/soft.safetensors',path:'Lora/Style/Illustrious/soft.safetensors'}});
    assert.equal(contentWrites.length,1,'назначение сохраняется в серверном content.json');
    assert.deepEqual(contentWrites[0].content['style:soft'].bindings.map(binding=>binding.kind),['prompt','lora']);
  }finally{Object.assign(globalThis,originals);dom.window.close();}
});
