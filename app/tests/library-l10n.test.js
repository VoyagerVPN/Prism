import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('библиотека переводит категории и действия, сохраняя пользовательские названия',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true});
  for(const key of ['window','document','CustomEvent','Event','Option','MutationObserver','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>url==='/prism/characters'?Response.json({characters:{},revision:'1'}):url==='/prism/content'?Response.json({content:{},revision:'1'}):Response.json({items:[{name:'Style/light.safetensors',title:'Мой стиль',category:'Style',base:'SDXL',version:'',author:'',tags:[],triggers:[],preview:'',images:[],description:'',url:''}]});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {initCharacters}=await import('../characters.js');const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    assert.equal(document.getElementById('lora-library-title').textContent,'Library');
    assert.match(document.querySelector('[data-category=Style]').textContent,/Styles/);
    assert.equal(document.querySelector('.library-card-title span:last-child').textContent,'Мой стиль');
    assert.equal(document.querySelector('.library-add').textContent,'Add style');
    document.querySelector('.library-open').click();
    assert.equal(document.querySelector('.library-technical-details summary').textContent,'Technical details');
    assert.equal(document.querySelector('#lora-library-details header button:last-child').textContent,'Close');
    document.querySelector('#lora-library-details').close();
    document.querySelector('[data-category=Style]').click();
    await l10n.changeLanguage('ru');dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(document.getElementById('lora-library-title').textContent,'Библиотека');
    assert.equal(document.querySelector('.library-card-title span:last-child').textContent,'Мой стиль');
    assert.equal(document.querySelector('[data-category=Style]').getAttribute('aria-pressed'),'true');
  }finally{setActiveLocalization(null);globalThis.fetch=originalFetch;dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','MutationObserver','localStorage'])delete globalThis[key];}
});
