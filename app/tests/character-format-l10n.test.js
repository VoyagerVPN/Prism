import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {parsePrism} from '../character_format.js';

test('ошибки импорта карточки переводятся при смене языка',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(l10n);
  try{
    assert.throws(()=>parsePrism('{'),/valid JSON/);
    await l10n.changeLanguage('ru');
    assert.throws(()=>parsePrism('{'),/корректный JSON/);
  }finally{setActiveLocalization(null);}
});
