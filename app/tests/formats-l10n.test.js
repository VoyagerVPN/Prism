import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('редактор формата и проверка размеров отображаются на выбранном языке',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {initImageFormats}=await import('../formats.js');initImageFormats();
    assert.equal(document.getElementById('add-format-btn').title,'Add format');
    document.getElementById('add-format-btn').click();
    assert.equal(document.getElementById('format-editor-title').textContent,'New format');
    assert.equal(document.querySelector('#format-editor [data-cancel]').textContent,'Cancel');
    const width=document.querySelector('#format-editor input[name=width]');width.value='257';width.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(document.querySelector('#format-editor [role=status]').textContent,'256–2048 px, a multiple of 8');
  }finally{setActiveLocalization(null);dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])delete globalThis[key];}
});
