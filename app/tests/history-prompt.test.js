import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {characterPromptPart} from '../prompt_parts.js';

test('Выбор результата возвращает его промпт и персонажей, сохраняя текущие параметры генерации',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true,runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  for(const key of ['window','document','Event','CustomEvent','Option','MutationObserver','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({characters:{},revision:'test'});
  try{
    await(await import('../characters.js')).initCharacters();
    const {applySettings,readSettings}=await import('../storage.js');
    const gallery=await import('../gallery.js');gallery.initGalleryEvents();
    const character={name:'Герой из снимка',lora:'Character/hero.safetensors',strength:0.7,trigger:'hero',appearances:{Ночь:'green eyes, ribbon'},activeAppearanceName:'Ночь',outfits:{Плащ:'red coat'},activeOutfitName:'Плащ',outfitEnabled:true};
    const parts=[{type:'text',text:'portrait '},characterPromptPart(character,{instanceId:'saved-hero',framePrompt:'sitting',disabledTags:[{kind:'appearance',variant:'Ночь',tag:'ribbon'}]}),{type:'lora',name:'Style/cinema.safetensors',strength:0.4}];
    const snapshot={positiveParts:parts,promptVersion:2,negative:'bad hands',loras:[],seed:5,batchLayout:'square-v1',batchCount:4,checkpoint:'old-model.safetensors',cfg:3,steps:20};
    const item={promptId:'saved-result',url:'/view?filename=grid.png',batchUrls:[1,2,3,4].map(i=>`/view?filename=frame-${i}.png`),settings:snapshot};
    const plain={promptId:'plain-result',url:'/view?filename=plain.png',settings:{positive:'landscape',negative:'',loras:[],seed:15}};
    gallery.updateHistory([item,plain]);gallery.renderGallery();
    applySettings({positive:'Текущий черновик',negative:'Текущее исключение',loras:[],checkpoint:'current-model.safetensors',cfg:7,steps:40,width:1280,height:720,seed:123,batchCount:1});
    const before=readSettings();
    document.querySelector('.gallery-thumb').click();
    let restored=readSettings();
    assert.deepEqual(restored.positiveParts,parts,'Возвращается структура снимка, включая ID экземпляра и выключенный тег');
    assert.equal(restored.negative,'bad hands');
    assert.equal(restored.positive,'portrait hero, green eyes, red coat, sitting');
    assert.equal(document.getElementById('batch-grid').children.length,4,'Клик показывает выбранную серию');
    for(const field of ['checkpoint','cfg','steps','width','height','seedInput','batchCount'])assert.equal(restored[field],before[field],field);
    applySettings({positive:'Другой черновик',positiveParts:[{type:'text',text:'Другой черновик'}],negative:'',loras:[]},{partial:true});
    document.querySelectorAll('#batch-grid button')[1].click();
    assert.equal(document.getElementById('output-image').getAttribute('src'),'/view?filename=frame-2.png');
    assert.deepEqual(readSettings().positiveParts,parts,'Клик по отдельному кадру также возвращает промпт');
    document.querySelectorAll('.gallery-group')[1].click();document.querySelector('.gallery-thumb').click();
    restored=readSettings();assert.equal(restored.positive,'landscape');assert.equal(restored.negative,'');assert.deepEqual(restored.loras,[]);assert.equal(restored.character,null,'Кадр без персонажа убирает предыдущего персонажа');
    applySettings({positiveParts:[{type:'text',text:'Несохранённый черновик'}],negative:'Черновик исключений'},{partial:true});
    gallery.displayOutputImage({promptId:'new-completion',settings:snapshot,workflow:{},outputs:[{filename:'new.png',type:'output',subfolder:''}]});
    assert.equal(readSettings().positive,'Несохранённый черновик','Приход готовой генерации не перезаписывает текущий ввод');
    gallery.selectHistoryItem(item);
    assert.equal(readSettings().positive,'Несохранённый черновик','Программное восстановление выбранной картинки не перезаписывает ввод');
    assert.deepEqual(snapshot.positiveParts,parts,'Исходный снимок остаётся неизменённым');
  }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
