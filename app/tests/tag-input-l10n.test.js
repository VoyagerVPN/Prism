import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {createTagInput} from '../tag_input.js';

test('действия над тегом локализованы, исходный текст тега сохранён',async()=>{
  const dom=new JSDOM('<textarea>blue eyes</textarea>',{url:'http://localhost/',runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const input=createTagInput(dom.window.document.querySelector('textarea'),{kind:'appearance',label:'Appearance',icon:'palette',onChange:()=>{}});
    const button=dom.window.document.querySelector('.tagify__tag__removeBtn');
    assert.equal(button.title,'Remove tag');assert.equal(button.getAttribute('aria-label'),'Remove tag blue eyes');
    assert.equal(input.read(),'blue eyes');input.destroy();
  }finally{setActiveLocalization(null);dom.window.close();}
});
