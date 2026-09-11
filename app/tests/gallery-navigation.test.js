import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Сохранённая сетка открывается как пятое изображение; стрелки проходят каждый кадр и соседние группы',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;globalThis.Event=dom.window.Event;
  try{
    const gallery=await import('../gallery.js');gallery.initGalleryEvents();
    const image=name=>({filename:`${name}.png`,subfolder:'',type:'output'});
    const frames=[1,2,3,4].map(i=>image(`frame-${i}`));const grid=image('grid');
    const settings={seed:100,batchCount:4,batchLayout:'square-v1',positive:'portrait',loras:[{name:'hero.safetensors',strength:1}]};
    gallery.updateHistory([{promptId:'single',url:'/single.png',settings:{seed:9,positive:'landscape',loras:[]}}]);
    gallery.displayOutputImage({promptId:'series',settings,workflow:{grid_save:{class_type:'SaveImage',inputs:{}}},outputs:[...frames,grid],gridOutput:grid});
    const item=gallery.selectedHistoryItem;
    assert.equal(item.batchUrls.length,4,'Сетка не становится пятым кадром серии');
    assert.match(item.url,/filename=grid.png/);
    assert.equal(document.querySelector('#output-image').style.display,'block');
    assert.equal(document.querySelector('#batch-grid').style.display,'none');
    assert.equal(document.querySelectorAll('.batch-thumb').length,5);
    assert.equal(document.querySelector('.history-count').textContent,'2×2');
    document.querySelector('#fullscreen-btn').click();
    assert.match(document.querySelector('#lightbox-img').src,/filename=grid.png/);
    const restored=[];window.addEventListener('restore-history-prompt',event=>restored.push(event.detail.seed));
    for(let index=1;index<=4;index++){
      document.querySelector('#lightbox-next').click();
      assert.equal(gallery.selectedHistoryItem.promptId,'series');
      assert.equal(gallery.selectedBatchIndex,index);
      assert.match(document.querySelector('#lightbox-img').src,new RegExp(`filename=frame-${index}.png`));
    }
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true}));
    assert.equal(gallery.selectedHistoryItem.promptId,'single');
    assert.match(document.querySelector('.gallery-group[aria-pressed="true"]').textContent,/Без LoRA/);
    assert.deepEqual(restored,[100,101,102,103,9]);
    document.querySelector('#lightbox-next').click();
    assert.match(document.querySelector('#lightbox-img').src,/filename=grid.png/,'Переход через конец истории возвращает сетку');
    document.querySelector('#lightbox-prev').click();
    assert.equal(gallery.selectedHistoryItem.promptId,'single');
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',cancelable:true}));
    assert.equal(gallery.selectedBatchIndex,4,'Назад из соседнего задания ведёт к последнему кадру серии');
    const legacy={...item,promptId:'legacy',gridUrl:null,url:item.batchUrls[0]};
    gallery.updateHistory([legacy]);gallery.selectHistoryItem(legacy,4);gallery.openLightbox();
    document.querySelector('#lightbox-next').click();
    assert.equal(gallery.selectedBatchIndex,1,'У старой серии без PNG сетки перебираются все четыре кадра без дубликата первого');
  }finally{dom.window.close();}
});
