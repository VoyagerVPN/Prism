import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {variantOptionLabel,renderVariantLink} from '../character_variants.js';
import {JSDOM} from 'jsdom';

test('безымянные варианты и подсказка связи переведены, а имя пользователя сохраняется',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  const dom=new JSDOM('<button></button>');
  try{
    const character={appearances:{variant_1:'',coat:''},outfits:{outfit:''},variantNames:{appearance:{variant_1:'',coat:'Мой образ'}}};
    assert.equal(variantOptionLabel(character,'appearance','variant_1'),'Untitled · 1');
    assert.equal(variantOptionLabel(character,'appearance','coat'),'Мой образ');
    renderVariantLink(dom.window.document.querySelector('button'),character);
    assert.match(dom.window.document.querySelector('button').title,/Link selected appearance and outfit/);
  }finally{setActiveLocalization(null);dom.window.close();}
});
