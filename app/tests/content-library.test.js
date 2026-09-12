import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('библиотека показывает контент и смысловые действия, а не LoRA-файлы', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  const source=(name,title,category)=>({name,title,category,base:'Illustrious',version:'',author:'',tags:[],triggers:['technical_trigger'],preview:'',cover:null,images:[],description:'',url:''});
  const items=[
    source('Character/hero.safetensors','Героиня','Character'),
    source('Concept/cyberpunk.safetensors','Киберпанк','Concept'),
    source('Style/light.safetensors','Мягкий свет','Style'),
    source('Pose/run.safetensors','Бег','Pose'),
    source('Clothing/coat.safetensors','Пальто','Clothing'),
    source('Object/sword.safetensors','Меч','Object'),
    source('Background/forest.safetensors','Лес','Background'),
    source('Utility/bloom-effect.safetensors','Свечение','Utility'),
    source('Processing/detail-upscale.safetensors','Детализация','Utility'),
    source('misc-file.safetensors','Неизвестный файл','Other'),
  ];
  globalThis.fetch=async url=>url==='/prism/characters'
    ? Response.json({characters:{},revision:'r1'})
    : Response.json({items});
  try {
    const {initCharacters}=await import('../characters.js');
    const {loadLoraLibrary,getContentImportTargets}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    assert.deepEqual(getContentImportTargets().map(({type})=>type),['Character','Concept','Style','Pose','Clothing','Object','Background','Effect','Processing']);
    const cards=[...document.querySelectorAll('.library-card')];
    assert.deepEqual(cards.map(card=>card.dataset.contentType),[
      'Character','Concept','Style','Pose','Clothing','Object','Background','Effect','Processing','inbox',
    ]);
    assert.deepEqual(cards.map(card=>card.querySelector('.library-card-actions button')?.textContent.trim()),[
      'Создать персонажа','Добавить концепт','Добавить стиль','Назначить позу','Добавить одежду','Добавить предмет','Выбрать фон','Применить эффект','Применить обработку','Настроить источник',
    ]);
    assert.equal(cards.some(card=>/LoRA|\.safetensors/i.test(card.querySelector('.library-card-info').textContent)),false);
    assert.equal(cards.at(-1).dataset.libraryEntity,'source');
    assert.match(cards.at(-1).textContent,/Требуется настройка/);
    const styleAction=cards[2].querySelector('.library-card-actions button');
    assert.match(styleAction.title,/Выразительность стиля/);
    cards[2].querySelector('.library-open').click();
    const technical=document.querySelector('#lora-library-details details.library-technical-details');
    assert.equal(technical.open,false);
    assert.match(technical.querySelector('.library-file-link').textContent,/light\.safetensors/);
    assert.equal(document.querySelector('#lora-library-details .library-intensity-language span:last-child').textContent,'Выразительность стиля');
    assert.deepEqual([...document.querySelectorAll('#lora-library-categories button')].map(button=>button.dataset.category),[
      'all','Character','Concept','Style','Pose','Clothing','Object','Background','Effect','Processing','inbox',
    ]);
    const {setupPromptEditor}=await import('../prompt_editor.js');setupPromptEditor();
    styleAction.click();await new Promise(resolve=>setImmediate(resolve));
    const token=document.querySelector('#positive-prompt-editor .prompt-content');
    assert.equal(token?.dataset.contentType,'Style');
    assert.equal(document.querySelector('#positive-prompt-editor .prompt-lora'),null);
    const contentSnapshot=JSON.parse(token.dataset.content).snapshot;
    assert.equal(contentSnapshot.bindings[0].name,'Style/light.safetensors');
    assert.deepEqual(contentSnapshot.prompt,['technical_trigger']);
  } finally {
    document.body.replaceChildren();Object.assign(globalThis,originals);dom.window.close();
  }
});
