import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Закрытие редактора сохраняет поля, отмена возвращает состояние до открытия',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  for(const key of ['window','document','CustomEvent','Event','Option','MutationObserver','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const $=id=>document.getElementById(id),item={name:'Character/test.safetensors',title:'Тестовая LoRA',category:'Character',base:'Illustrious',triggers:[],tags:[]};
  let records={Герой:{name:'Герой',lora:item.name,strength:1,appearance:'green eyes',outfits:{День:'blue coat'},activeOutfitName:'День',outfitEnabled:true}},writes=0,rejectSave=false;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/lora-library')return Response.json({items:[item]});
    assert.equal(url,'/prism/characters');
    if(options.method==='POST'){
      if(rejectSave)return Response.json({error:'Тестовая ошибка сохранения'},{status:503});
      records=JSON.parse(options.body).characters;writes++;
    }
    return Response.json({characters:records,revision:String(writes)});
  };
  const settle=async()=>{for(let index=0;index<20;index++)await new Promise(resolve=>setImmediate(resolve));};
  const open=()=>document.querySelector('.library-open').click();
  try{
    await(await import('../characters.js')).initCharacters();
    await(await import('../library.js')).loadLoraLibrary();
    open();
    $('profile-character-universe').value='Новый мир';
    $('profile-character-description').value='Заметки героя';
    $('profile-character-base').value='blue eyes';
    $('profile-outfit-text').value='red coat';
    $('lora-library-details').querySelector('.dialog-heading button:last-child').click();
    await settle();
    assert.equal($('lora-library-details').open,false);
    open();
    assert.equal($('profile-character-base').value,'blue eyes','Закрытие сохраняет введённую внешность');
    assert.equal($('profile-outfit-text').value,'red coat');
    assert.equal($('profile-character-universe').value,'Новый мир');
    assert.equal($('profile-character-description').value,'Заметки героя');
    assert.equal($('profile-use-character'),null);
    for(const selector of ['#profile-save-character','#profile-export-character','.close-profile-editor']){
      const use=$('library-character-editor').querySelector(selector+' use');
      assert.ok(use&&document.querySelector(use.getAttribute('href')),'Действие имеет существующую иконку');
    }
    const unchangedWrites=writes;
    $('lora-library-details').dispatchEvent(new Event('cancel',{cancelable:true}));await settle();
    assert.equal(writes,unchangedWrites,'Закрытие без изменений не создаёт запись');
    open();
    for(const dismissal of ['backdrop','escape']){
      $('profile-character-description').value='Сохранено: '+dismissal;
      const modal=$('lora-library-details');
      if(dismissal==='backdrop'){
        modal.getBoundingClientRect=()=>({left:100,top:100,right:300,bottom:300});
        for(const type of ['pointerdown','click'])modal.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,clientX:40,clientY:40}));
      }else modal.dispatchEvent(new Event('cancel',{cancelable:true}));
      await settle();assert.equal(modal.open,false);open();
      assert.equal($('profile-character-description').value,'Сохранено: '+dismissal,'Способ закрытия сохраняет введённые данные');
    }
    $('profile-character-description').value='Заметки героя';
    const form=$('library-character-editor').querySelector('form');
    await form.onsubmit({preventDefault(){}});assert.equal($('lora-library-details').open,false);open();
    rejectSave=true;
    $('profile-character-base').value='unsaved eyes';
    $('lora-library-details').dispatchEvent(new Event('cancel',{cancelable:true}));
    await settle();
    assert.equal($('lora-library-details').open,true,'Ошибка записи оставляет редактор открытым');
    assert.equal($('profile-character-base').value,'unsaved eyes','Черновик остаётся доступен после ошибки');
    assert.match($('profile-editor-status').textContent,/Тестовая ошибка сохранения/);
    $('library-character-editor').querySelector('.close-profile-editor').click();
    open();
    assert.equal($('profile-character-base').value,'blue eyes','Отмена после ошибки также возвращает сохранённое состояние');
    $('profile-character-base').value='discard';
    $('profile-character-description').value='Отменяемые заметки';
    $('library-character-editor').querySelector('.close-profile-editor').click();
    await settle();open();
    assert.equal($('profile-character-base').value,'blue eyes','Отмена восстанавливает состояние предыдущего открытия');
    assert.equal($('profile-character-description').value,'Заметки героя');
  }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
