import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('ошибка восстановления настроек понятна на выбранном языке и не стирает данные',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','Event','CustomEvent','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {loadSavedSettings}=await import('../storage.js');
    localStorage.setItem('matrix_dashboard_v3','invalid json');let message='';window.addEventListener('dashboard-warning',event=>{message=event.detail;});
    assert.deepEqual(loadSavedSettings(),[]);assert.match(message,/Could not restore settings/);
    assert.equal(localStorage.getItem('matrix_dashboard_v3'),'invalid json');
  }finally{setActiveLocalization(null);dom.window.close();for(const key of ['window','document','Event','CustomEvent','Option','localStorage'])delete globalThis[key];}
});
