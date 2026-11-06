import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('подсказка превью меняет язык и сохраняет состояние переключателя',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {setupLivePreview}=await import('../live_preview.js');setupLivePreview(new dom.window.EventTarget());
    const button=document.getElementById('preview-toggle');
    assert.equal(button.title,'Hide generation preview');button.click();
    assert.equal(button.title,'Show generation preview');
    await l10n.changeLanguage('ru');dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(button.title,'Показать превью генерации');assert.equal(button.getAttribute('aria-pressed'),'false');
  }finally{setActiveLocalization(null);dom.window.close();for(const key of ['window','document','CustomEvent','Event','localStorage'])delete globalThis[key];}
});
