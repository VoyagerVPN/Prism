import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {loadContentRegistry} from '../content_registry.js';

test('ошибки хранилища контента следуют текущему языку',async()=>{
  const oldFetch=globalThis.fetch;
  const localization=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(localization);
  globalThis.fetch=async()=>new Response('<html>',{status:404});
  try{
    await assert.rejects(loadContentRegistry({force:true}),/content storage.*not registered/i);
    await localization.changeLanguage('ru');
    await assert.rejects(loadContentRegistry({force:true}),/Хранилище контента не зарегистрировано/);
  }finally{globalThis.fetch=oldFetch;setActiveLocalization(null);}
});
