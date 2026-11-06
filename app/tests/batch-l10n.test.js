import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('количество кадров использует правила текущего языка',async()=>{
  const dom=new JSDOM('<input id="batch-count" value="0"><span id="batch-count-label"></span>');
  globalThis.document=dom.window.document;
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {syncBatchControls}=await import('../batch.js');
    syncBatchControls();assert.equal(document.getElementById('batch-count-label').textContent,'1 image');
    document.getElementById('batch-count').value='1';syncBatchControls();
    assert.equal(document.getElementById('batch-count-label').textContent,'4 images · 2×2');
    await l10n.changeLanguage('ru');syncBatchControls();
    assert.equal(document.getElementById('batch-count-label').textContent,'4 изображения · 2×2');
  }finally{setActiveLocalization(null);dom.window.close();delete globalThis.document;}
});
