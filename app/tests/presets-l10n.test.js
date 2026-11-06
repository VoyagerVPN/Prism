import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('пресеты показывают состояние на выбранном языке, сохраняя выбранную запись',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({presets:{},revision:'1'});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(l10n);
  try{
    const presets=await import('../presets.js');
    presets.initPresetEvents();await presets.loadCustomProfiles();
    assert.equal(document.querySelector('#profile-select option').textContent,'No preset');
    assert.equal(document.querySelector('#preset-status').textContent,'Current settings — no preset');
    await l10n.changeLanguage('ru');
    dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(document.querySelector('#profile-select option').textContent,'Без пресета');
    assert.equal(document.querySelector('#profile-select').value,'default');
  }finally{setActiveLocalization(null);globalThis.fetch=originalFetch;dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])delete globalThis[key];}
});
