import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('выбор персонажа меняет язык и сохраняет выбранного персонажа',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({characters:{'Алиса':{name:'Алиса',lora:'None',appearance:'',outfits:{'По умолчанию':''},activeOutfitName:'По умолчанию'}},revision:'1'});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const characters=await import('../characters.js');await characters.initCharacters();
    assert.equal(document.querySelector('#character-select option[value=none]').textContent,'No character');
    characters.renderCharacterSelect('Алиса');
    await l10n.changeLanguage('ru');dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(document.querySelector('#character-select option[value=none]').textContent,'Без персонажа');
    assert.equal(document.getElementById('character-select').value,'Алиса');
    assert.ok(Object.hasOwn(characters.getSavedCharacters(),'Алиса'));
  }finally{setActiveLocalization(null);globalThis.fetch=originalFetch;dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])delete globalThis[key];}
});
