import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('диалог подтверждения использует выбранный язык и сохраняет текст вызывающей стороны',async()=>{
  const dom=new JSDOM('<body></body>',{url:'http://localhost/'});
  globalThis.document=dom.window.document;globalThis.window=dom.window;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  setActiveLocalization(l10n);
  try{
    const {askConfirm}=await import('../dialogs.js');
    const result=askConfirm('Delete Алиса?');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(document.querySelector('#action-title').textContent,'Confirm');
    assert.equal(document.querySelector('#action-message').textContent,'Delete Алиса?');
    assert.equal(document.querySelector('[data-cancel]').textContent,'Cancel');
    assert.equal(document.querySelector('[type=submit]').textContent,'Delete');
    document.querySelector('[data-cancel]').click();
    assert.equal(await result,false);
  }finally{setActiveLocalization(null);dom.window.close();delete globalThis.document;delete globalThis.window;}
});
