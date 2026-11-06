import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('действия выбранного результата переводятся без смены кадра',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(l10n);
  try{
    const gallery=await import('../gallery.js');
    const item={promptId:'art',url:'/view?filename=art.png',seed:7,settings:{seed:7},checkpoint:'model.safetensors',steps:20,cfg:7,workflow:{}};
    gallery.updateHistory([item]);gallery.initGalleryEvents();gallery.renderGallery();gallery.selectHistoryItem(item);
    assert.equal(document.getElementById('download-btn').title,'Download selected image');
    assert.equal(document.querySelector('.gallery-group-label').textContent,'Prompt');
    await l10n.changeLanguage('ru');
    dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(document.getElementById('download-btn').title,'Скачать выбранный кадр');
    assert.equal(gallery.selectedHistoryItem,item);
    assert.equal(gallery.selectedBatchIndex,0);
  }finally{setActiveLocalization(null);dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])delete globalThis[key];}
});
