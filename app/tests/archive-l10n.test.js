import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('галерея переводит элементы и сохраняет пользовательские имена и фильтр',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(l10n);
  const items=[{id:'art',image:{filename:'a.png',type:'output'},characters:[{name:'Алиса'}],favorite:false,settings:{}}];
  try{
    const {initArchiveGallery}=await import('../archive_gallery.js');
    await initArchiveGallery({fetchImpl:async()=>Response.json({items}),migrate:false});
    assert.equal(document.querySelector('.archive-caption').textContent,'Алиса');
    assert.equal(document.querySelector('.archive-favorite').title,'Add to favorites');
    document.querySelector('[data-gallery-filter="favorites"]').click();
    assert.equal(document.querySelector('#archive-empty').textContent,'No images match the selected filter.');
    await l10n.changeLanguage('ru');
    dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(document.querySelector('#archive-empty').textContent,'По выбранному фильтру артов нет.');
    assert.equal(document.querySelector('[data-gallery-filter="favorites"]').getAttribute('aria-pressed'),'true');
  }finally{setActiveLocalization(null);dom.window.close();for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])delete globalThis[key];}
});
