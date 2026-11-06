import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {normalizePromptParts} from '../prompt_parts.js';

test('ошибки валидации промпта используют выбранный язык',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    assert.throws(()=>normalizePromptParts([{type:'lora',name:'../bad.safetensors',strength:1}]),/Invalid LoRA or strength/);
    assert.throws(()=>normalizePromptParts([{type:'text',text:42}]),/Invalid prompt text/);
  }finally{setActiveLocalization(null);}
});
