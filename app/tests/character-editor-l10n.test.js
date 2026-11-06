import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('новая карточка персонажа показывает английский интерфейс без изменения данных',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  for(const key of ['window','document','CustomEvent','Event','Option','MutationObserver','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>url==='/prism/characters'?Response.json({characters:{},revision:'1'}):url==='/prism/content'?Response.json({content:{},revision:'1'}):Response.json({items:[]});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {initCharacters}=await import('../characters.js');const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();document.getElementById('add-character-btn').click();
    assert.equal(document.querySelector('#profile-editor-title span').textContent,'Character setup');
    assert.equal(document.getElementById('profile-character-universe').placeholder,'Enter a universe');
    assert.equal(document.getElementById('profile-appearance-name').value,'Default');
    assert.equal(document.querySelector('#profile-delete-character').textContent,'Delete character');
  }finally{setActiveLocalization(null);globalThis.fetch=originalFetch;dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','MutationObserver','localStorage'])delete globalThis[key];}
});
