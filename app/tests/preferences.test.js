import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

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
