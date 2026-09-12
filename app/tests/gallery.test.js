import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Галерея группирует персонажей и обычные LoRA как разные сущности',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;globalThis.Event=dom.window.Event;
  const item=(id,loras,character)=>({promptId:id,url:`/view?filename=${id}.png`,settings:{seed:1,loras,character}});
  const a={name:'Character/a.safetensors',strength:1},b={name:'Character/b.safetensors',strength:0.8};
  try{
    const gallery=await import('../gallery.js');
    gallery.updateHistory([
      item('a-new',[a],{name:'Алиса',lora:a.name}),
      item('pair',[a,b]),item('a-old',[{...a,name:'Character\\a.safetensors',strength:0.5}]),
      item('pair-reversed',[b,a]),item('without-model',[],{name:'Путешественник',lora:'None'}),item('plain',[]),
    ]);
    gallery.renderGallery();
    assert.equal(document.getElementById('gallery-groups').getAttribute('aria-label'),'Группы результатов по содержимому');
    const groups=[...document.querySelectorAll('.gallery-group')];
    assert.equal(groups.length,5,'Персонаж, его LoRA как отдельная модель и результат без сущностей не сливаются');
    assert.match(groups[0].textContent,/Алиса/);
    assert.equal(document.querySelectorAll('.gallery-thumb').length,1,'Видны только результаты первой группы');
    groups[1].click();
    assert.equal(document.querySelectorAll('.gallery-thumb').length,2);
    assert.equal(gallery.selectedHistoryItem,null,'Раскрытие группы не выбирает кадр и не меняет промпт');
    const thumbnails=[...document.querySelectorAll('.gallery-thumb')];
    thumbnails[1].click();
    assert.equal(gallery.selectedHistoryItem.promptId,'pair-reversed');
    assert.equal(document.querySelectorAll('.gallery-thumb.active').length,1);
    assert.equal(document.querySelector('.gallery-thumb.active').getAttribute('aria-pressed'),'true');
    assert.match(groups[2].textContent,/a/,'Обычная LoRA остаётся отдельной от профиля на той же модели');
    assert.match(groups[3].textContent,/Путешественник/);
    groups[4].click();
    assert.match(document.querySelector('.gallery-group[aria-pressed="true"]').textContent,/Промпт/);
    assert.equal(document.querySelectorAll('.gallery-thumb').length,1);
    gallery.updateHistory([item('undyne',[a],{name:'Undyne',lora:a.name}),item('muffet',[a],{name:'Muffet',lora:a.name})]);gallery.renderGallery();
    assert.deepEqual([...document.querySelectorAll('.gallery-group-label')].map(label=>label.textContent),['Undyne','Muffet'],'Общая LoRA не сливает два персонажа в одну группу');
    const content={
      type:'content',contentId:'style:cinematic',contentType:'Style',name:'Кинематографический свет',scope:'global',
      snapshot:{prompt:['cinematic lighting'],negative:[],bindings:[{kind:'lora',name:'Style/private-file.safetensors',strength:0.7}],parameters:{intensity:0.7}},
    };
    gallery.updateHistory([{promptId:'semantic',url:'/semantic.png',settings:{promptVersion:2,positiveParts:[content,{type:'lora',name:'Style/private-file.safetensors',strength:0.7}]}}]);gallery.renderGallery();
    assert.deepEqual([...document.querySelectorAll('.gallery-group-label')].map(label=>label.textContent),['Кинематографический свет']);
    assert.doesNotMatch(document.getElementById('gallery-groups').textContent,/private-file|safetensors/i,'Техническая реализация контента не становится отдельной группой');
  }finally{dom.window.close();}
});
