import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Галерея объединяет результаты по набору LoRA и показывает только выбранную группу',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;globalThis.Event=dom.window.Event;
  const item=(id,loras,character)=>({promptId:id,url:`/view?filename=${id}.png`,settings:{seed:1,loras,character}});
  const a={name:'Character/a.safetensors',strength:1},b={name:'Character/b.safetensors',strength:0.8};
  try{
    const gallery=await import('../gallery.js');
    gallery.updateHistory([
      item('a-new',[a],{name:'Алиса',lora:a.name}),
      item('pair',[a,b]),item('a-old',[{...a,name:'Character\\a.safetensors',strength:0.5}]),
      item('pair-reversed',[b,a]),item('plain',[]),
    ]);
    gallery.renderGallery();
    const groups=[...document.querySelectorAll('.gallery-group')];
    assert.equal(groups.length,3,'Одинаковый набор без учёта порядка, разделителей пути и веса образует одну группу');
    assert.match(groups[0].textContent,/Алиса/);
    assert.equal(document.querySelectorAll('.gallery-thumb').length,2,'Видны только результаты первой группы');
    groups[1].click();
    assert.equal(document.querySelectorAll('.gallery-thumb').length,2);
    assert.equal(gallery.selectedHistoryItem,null,'Раскрытие группы не выбирает кадр и не меняет промпт');
    const thumbnails=[...document.querySelectorAll('.gallery-thumb')];
    thumbnails[1].click();
    assert.equal(gallery.selectedHistoryItem.promptId,'pair-reversed');
    assert.equal(document.querySelectorAll('.gallery-thumb.active').length,1);
    assert.equal(document.querySelector('.gallery-thumb.active').getAttribute('aria-pressed'),'true');
    document.querySelectorAll('.gallery-group')[2].click();
    assert.match(document.querySelector('.gallery-group[aria-pressed="true"]').textContent,/Без LoRA/);
    assert.equal(document.querySelectorAll('.gallery-thumb').length,1);
  }finally{dom.window.close();}
});
