import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Первое открытие импорта удерживает нейтральный фокус и открывает именно выбранное поле',async()=>{
  for(const first of ['import-kind','import-base','import-category']){
    const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
    dom.window.eval(await readFile(new URL('../vendor-select.js',import.meta.url),'utf8'));
    const keys=['window','document','Element','HTMLElement','HTMLSelectElement','Event','Option','MutationObserver','TomSelect','innerWidth','innerHeight','FormData','XMLHttpRequest','fetch'];
    const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
    for(const key of keys.filter(key=>!['XMLHttpRequest','fetch'].includes(key)))globalThis[key]=key==='window'?dom.window:dom.window[key];
    const doc=dom.window.document;
    // JSDOM не реализует начальный фокус showModal; воспроизводим выбор autofocus или первого фокусируемого элемента.
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;(this.querySelector('[autofocus]')||this.querySelector('[tabindex]')||this).focus();};
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
    class DuplicateUpload{
      upload={};open(){}
      send(){this.status=409;this.response={error:'Такой файл уже есть'};queueMicrotask(()=>this.onload());}
    }
    globalThis.XMLHttpRequest=DuplicateUpload;
    globalThis.fetch=async()=>Response.json({kind:'loras',base:'anima',category:null,bases:['anima'],categories:['Character','Other'],evidence:{},trainingModel:'anima-preview3-base.safetensors'});
    const {setupSelectControls,syncSelectControls}=await import('../controls.js');
    try{
      const {setupModelImport}=await import('../import.js');
      setupModelImport(async()=>{});setupSelectControls();
      const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
      const file={name:'slavya.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{}'}};
      Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file]});
      doc.querySelector('#model-import-file').dispatchEvent(new Event('change'));
      for(let step=0;step<30&&!doc.querySelector('#import-status').textContent.includes('уже есть');step++)await new Promise(resolve=>setTimeout(resolve,0));
      const dialog=doc.querySelector('#model-import-dialog');
      assert.ok(dialog.contains(doc.activeElement),'Фокус остаётся в окне после возврата из выбора файла');
      assert.equal(doc.activeElement.closest('#import-fields'),null,'Открытие окна не фокусирует селекторы, включая исходный select');
      assert.equal(dialog.querySelector('[aria-expanded="true"]'),null);
      const target=first==='import-base'?doc.querySelector('[aria-label="Выбрать: Базовая модель"]'):doc.getElementById(first+'-ts-control');
      target.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,cancelable:true}));target.click();
      await new Promise(resolve=>setTimeout(resolve,5));
      assert.deepEqual([...dialog.querySelectorAll('[role="combobox"][aria-expanded="true"]')].map(element=>element.id),[first==='import-base'?first:first+'-ts-control']);
    }finally{doc.body.replaceChildren();syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
  }
});
