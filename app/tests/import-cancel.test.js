import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Клик по фону прерывает подтверждённую загрузку и закрывает окно',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
  const {window}=dom,doc=window.document,originals={document:globalThis.document,window:globalThis.window,Option:globalThis.Option,FormData:globalThis.FormData,XMLHttpRequest:globalThis.XMLHttpRequest,fetch:globalThis.fetch};
  let aborted=false;
  class PendingUpload {
    upload={};
    open(){}
    send(){}
    abort(){aborted=true;this.onabort?.();}
  }
  const header=JSON.stringify({__metadata__:{}}),prefix=new ArrayBuffer(8);
  new DataView(prefix).setBigUint64(0,BigInt(header.length),true);
  const file={name:'test.safetensors',size:header.length+12,slice(start){return start===0?{arrayBuffer:async()=>prefix}:{text:async()=>header};}};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  Object.assign(globalThis,{document:doc,window,Option:window.Option,FormData:window.FormData,XMLHttpRequest:PendingUpload,fetch:async()=>Response.json({kind:'loras',base:'SDXL',suggestedBase:'SDXL',category:'Character',categories:['Character'],bases:['SDXL'],evidence:{}})});
  try{
    const {setupModelImport}=await import('../import.js');
    setupModelImport(async()=>{});
    const input=doc.querySelector('#model-import-file');
    Object.defineProperty(input,'files',{value:[file]});
    input.dispatchEvent(new window.Event('change'));
    for(let step=0;step<20&&doc.querySelector('#import-save').disabled;step++)await new Promise(resolve=>setTimeout(resolve,0));
    doc.querySelector('#import-save').click();
    for(let step=0;step<20&&!doc.querySelector('#import-cancel').disabled;step++)await new Promise(resolve=>setTimeout(resolve,0));
    const dialog=doc.querySelector('#model-import-dialog');
    assert.equal(dialog.open,true);
    assert.equal(doc.querySelector('#import-cancel').disabled,true,'Загрузка должна начаться после подтверждения');
    dialog.getBoundingClientRect=()=>({left:100,right:300,top:100,bottom:300});
    dialog.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,clientX:10,clientY:10}));
    dialog.dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:10,clientY:10}));
    assert.equal(aborted,true);
    assert.equal(dialog.open,false);
  }finally{
    Object.assign(globalThis,originals);
    dom.window.close();
  }
});
