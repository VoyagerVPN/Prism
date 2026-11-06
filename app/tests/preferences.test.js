import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,createServerLanguageStore,setActiveLocalization} from '../i18n.js';

test('ошибка сервера при сохранении языка понятна и не сбрасывает черновик',async()=>{
  const {setupPreferences}=await import('../preferences.js');
  for(const [initial,next,expected,failure] of [['en','ru','Could not save the language','http'],['ru','en','Не удалось сохранить язык','http'],['en','ru','Could not save the language','network'],['ru','en','Не удалось сохранить язык','network']]){
    const dom=new JSDOM('<button id="prism-settings-open"></button>',{url:'http://localhost/'}),doc=dom.window.document;
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    const fetchImpl=async(_url,options={})=>{if(options.method==='POST'){if(failure==='network')throw new TypeError('Failed to fetch');return {ok:false};}return {ok:true,json:async()=>({language:initial})};};
    const l10n=await createLocalization({storage:createServerLanguageStore(fetchImpl)});setActiveLocalization(l10n);
    try{
      setupPreferences({doc,storage:dom.window.localStorage,localization:l10n});doc.querySelector('button').click();
      doc.querySelector('#preference-appearance-name').value='My draft';doc.querySelector('#preference-language').value=next;
      doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
      assert.match(doc.querySelector('#prism-settings-status').textContent,new RegExp(expected));
      assert.equal(doc.querySelector('#prism-settings').open,true);assert.equal(doc.querySelector('#preference-appearance-name').value,'My draft');
      assert.equal(l10n.language,initial);
    }finally{setActiveLocalization(null);dom.window.close();}
  }
});

test('начальные имена новых вариантов следуют языку, сохранённые имена не меняются',async()=>{
  const {readPreferences,savePreferences}=await import('../preferences.js');
  const dom=new JSDOM('',{url:'http://localhost/'}),storage=dom.window.localStorage;
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    assert.equal(readPreferences(storage).initialAppearanceName,'Default');
    assert.throws(()=>savePreferences({...readPreferences(storage),initialAppearanceName:'__proto__'},storage),/Name must be at most 200 characters/);
    savePreferences({...readPreferences(storage),initialAppearanceName:'По умолчанию'},storage);
    await l10n.changeLanguage('ru');
    assert.equal(readPreferences(storage).initialAppearanceName,'По умолчанию');
    await l10n.changeLanguage('en');
    assert.equal(readPreferences(storage).initialAppearanceName,'По умолчанию');
  }finally{setActiveLocalization(null);dom.window.close();}
});

test('Настройки Prism сохраняют первичные имена отдельно от рецепта генерации',async()=>{
  const {readPreferences,savePreferences}=await import('../preferences.js');
  const dom=new JSDOM('',{url:'http://localhost/'}),storage=dom.window.localStorage;
  try{
    assert.equal(readPreferences(storage).initialAppearanceName,'По умолчанию');
    assert.equal(readPreferences(storage).initialOutfitName,'По умолчанию');
    assert.equal(readPreferences(storage).autoCivitaiMetadata,true);
    savePreferences({...readPreferences(storage),initialAppearanceName:'Базовая',initialOutfitName:'Повседневный'},storage);
    assert.equal(readPreferences(storage).initialAppearanceName,'Базовая');
    assert.equal(readPreferences(storage).initialOutfitName,'Повседневный');
    assert.equal(storage.getItem('matrix_dashboard_v3'),null);
  }finally{dom.window.close();}
});

test('Окно настроек сохраняет выбор, отмена оставляет прежние предпочтения',async()=>{
  const {setupPreferences,readPreferences}=await import('../preferences.js');
  const dom=new JSDOM('<button id="prism-settings-open">Настройки Prism</button>',{url:'http://localhost/'}),doc=dom.window.document,storage=dom.window.localStorage;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  try{
    setupPreferences({doc,storage});
    assert.equal(doc.querySelector('label[for="preference-lora-weight"]').textContent,'Показывать интенсивность подключённого контента');
    assert.deepEqual([...doc.querySelectorAll('#preference-lora-weight option')].map(option=>option.textContent),['Всегда','Только изменённую']);
    doc.querySelector('button').click();
    assert.equal(doc.querySelector('dialog').open,true);
    doc.querySelector('#preference-appearance-name').value='Базовая';
    doc.querySelector('#preference-outfit-enabled').checked=false;
    doc.querySelector('#preference-lora-weight').value='modified';
    doc.querySelector('#preference-civitai-metadata').checked=false;
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    assert.equal(readPreferences(storage).initialAppearanceName,'Базовая');
    assert.equal(readPreferences(storage).initialOutfitEnabled,false);
    assert.equal(readPreferences(storage).autoCivitaiMetadata,false);
    assert.equal(doc.body.dataset.loraWeightDisplay,'modified');
    doc.querySelector('#prism-settings-open').click();doc.querySelector('#preference-appearance-name').value='Не сохранять';doc.querySelector('[data-cancel]').click();
    assert.equal(readPreferences(storage).initialAppearanceName,'Базовая');
    doc.querySelector('#prism-settings-open').click();
    assert.equal(doc.querySelector('#preference-outfit-enabled').checked,false,'Начальное состояние одежды восстанавливается');
    assert.equal(doc.querySelector('#preference-civitai-metadata').checked,false,'Настройка Civitai восстанавливается');
    doc.querySelector('[data-defaults]').click();doc.querySelector('[data-cancel]').click();
    assert.equal(readPreferences(storage).initialOutfitEnabled,false,'Сброс требует сохранения формы');
  }finally{dom.window.close();}
});

test('Выбранный язык сохраняется отдельно от настроек браузера и отмена не меняет его',async()=>{
  const {setupPreferences}=await import('../preferences.js');
  const dom=new JSDOM('<button id="prism-settings-open">Настройки Prism</button>',{url:'http://localhost/'});
  const doc=dom.window.document, storage=dom.window.localStorage;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let language='ru';
  const localization={get language(){return language;},async changeLanguage(next){language=next;}};
  try {
    setupPreferences({doc,storage,localization});
    doc.querySelector('#prism-settings-open').click();
    const selector=doc.querySelector('#preference-language');
    assert.deepEqual([...selector.options].map(option=>option.textContent),['English','Русский']);
    selector.value='en';doc.querySelector('[data-cancel]').click();
    assert.equal(language,'ru');
    doc.querySelector('#prism-settings-open').click();
    assert.equal(selector.value,'ru');
    selector.value='en';
    const changed=new Promise(resolve=>doc.defaultView.addEventListener('prism-language-changed',resolve,{once:true}));
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await changed;
    assert.equal(language,'en');
    assert.equal(doc.querySelector('dialog').open,false);
  } finally { dom.window.close(); }
});

test('после ошибки записи предпочтений уже сохранённый язык применяется, черновик остаётся в окне',async()=>{
  const {setupPreferences}=await import('../preferences.js');
  const dom=new JSDOM('<button id="prism-settings-open"></button>',{url:'http://localhost/'}),doc=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const storage={getItem:()=>null,setItem:()=>{throw new Error('blocked');}};
  let language='ru';const localization={get language(){return language;},async changeLanguage(next){language=next;}};
  try{
    setupPreferences({doc,storage,localization});doc.querySelector('button').click();
    doc.getElementById('preference-appearance-name').value='Черновик';doc.getElementById('preference-language').value='en';
    let changed=false;dom.window.addEventListener('prism-language-changed',()=>{changed=true;},{once:true});
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(changed,true);
    assert.equal(language,'en');assert.equal(doc.querySelector('dialog').open,true);
    assert.equal(doc.getElementById('preference-appearance-name').value,'Черновик');
    assert.match(doc.getElementById('prism-settings-status').textContent,/blocked/);
  }finally{dom.window.close();}
});
