import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {setupModelImport} from '../import.js';

test('импорт модели переводит выбор назначения и сохраняет заполненные поля',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/'});
  const {window}=dom,doc=window.document,keys=['document','window','Option','FormData','XMLHttpRequest','fetch'];
  const original=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  Object.assign(globalThis,{document:doc,window,Option:window.Option,FormData:window.FormData,XMLHttpRequest:class{},fetch:async()=>Response.json({kind:'loras',base:'SDXL',category:null,bases:['SDXL'],evidence:{}})});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    setupModelImport(async()=>{});
    const prefix=new ArrayBuffer(8);new DataView(prefix).setBigUint64(0,2n,true);
    const file={name:'test.safetensors',size:14,slice:start=>start===0?{arrayBuffer:async()=>prefix}:{text:async()=>'{ }'}};
    Object.defineProperty(doc.querySelector('#model-import-file'),'files',{value:[file],configurable:true});doc.querySelector('#model-import-file').dispatchEvent(new window.Event('change'));
    for(let n=0;n<40&&doc.querySelector('#import-fields').disabled;n++)await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(doc.querySelector('#model-import-title').textContent,'Add LoRA');
    doc.querySelector('[data-import-type=Style]').click();
    assert.equal(doc.querySelector('#model-import-title').textContent,'Add style');
    const name=doc.querySelector('#import-content-name');name.value='Мой стиль';
    await l10n.changeLanguage('ru');window.dispatchEvent(new window.CustomEvent('prism-language-changed'));
    assert.equal(doc.querySelector('#model-import-title').textContent,'Добавить стиль');
    assert.equal(name.value,'Мой стиль');
    assert.equal(doc.querySelector('#import-base').value,'SDXL');
  }finally{setActiveLocalization(null);Object.assign(globalThis,original);dom.window.close();}
});
