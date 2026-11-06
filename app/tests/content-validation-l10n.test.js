import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {createContentEntity} from '../content_catalog.js';
import {resolveContentPlan} from '../content_resolver.js';

test('проверки контента и выбора используют текущий язык',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    assert.throws(()=>createContentEntity({}),/Content ID must be/);
    assert.throws(()=>resolveContentPlan({}),/content catalog/);
    await l10n.changeLanguage('ru');
    assert.throws(()=>createContentEntity({}),/Content ID должен быть/);
  }finally{setActiveLocalization(null);}
});
