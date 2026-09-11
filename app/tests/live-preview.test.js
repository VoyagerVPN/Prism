import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Переключатель превью всегда доступен полноразмерной кнопкой рядом с Запуском',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  try{
    const button=dom.window.document.getElementById('preview-toggle');
    assert.equal(button.parentElement.className,'header-actions');
    assert.equal(button.nextElementSibling?.id,'generate-btn');
    assert.match(button.textContent,/Превью/);
    assert.equal(button.disabled,false);
    assert.equal(button.classList.contains('header-preview-btn'),true);
  }finally{dom.window.close();}
});

test('Глаз отключает только промежуточные кадры и возвращает готовое изображение',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;globalThis.Event=dom.window.Event;globalThis.localStorage=dom.window.localStorage;
  const client=new dom.window.EventTarget();client.busy=true;
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  let created=0;const revoked=[];
  URL.createObjectURL=()=>`blob:preview-${++created}`;URL.revokeObjectURL=url=>revoked.push(url);
  const header=new Uint8Array(8);new DataView(header.buffer).setUint32(0,1);new DataView(header.buffer).setUint32(4,2);
  const preview=new Blob([header,'test-image']);
  const settle=async()=>{for(let index=0;index<8;index++)await new Promise(resolve=>setImmediate(resolve));};
  try{
    const gallery=await import('../gallery.js');
    gallery.updateHistory([{promptId:'result',url:'/view?filename=finished.png',settings:{seed:1}}]);gallery.renderGallery();gallery.selectHistoryItem(gallery.history[0]);
    const {setupLivePreview}=await import('../live_preview.js');setupLivePreview(client);
    const button=document.getElementById('preview-toggle'),image=document.getElementById('output-image');
    client.dispatchEvent(new CustomEvent('preview',{detail:preview}));await settle();
    assert.equal(image.getAttribute('src'),'blob:preview-1');
    button.click();
    assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.querySelector('use').getAttribute('href'),'#icon-eye-off');
    assert.equal(image.getAttribute('src'),'/view?filename=finished.png','Выключение убирает промежуточное превью и показывает выбранный результат');
    client.dispatchEvent(new CustomEvent('preview',{detail:preview}));await settle();assert.equal(created,1,'Отключённые промежуточные кадры не создают URL');
    gallery.displayOutputImage({promptId:'new',settings:{seed:2},workflow:{},outputs:[{filename:'new-final.png',type:'output',subfolder:''}]});
    assert.match(image.getAttribute('src'),/new-final\.png/,'Готовый результат отображается при выключенном превью');
    button.click();client.dispatchEvent(new CustomEvent('preview',{detail:preview}));button.click();await settle();
    assert.equal(created,1,'Отключение во время чтения кадра не возвращает устаревшее превью');
    button.click();client.dispatchEvent(new CustomEvent('preview',{detail:preview}));await settle();
    assert.equal(created,2);client.busy=false;client.dispatchEvent(new CustomEvent('job',{detail:{status:'succeeded'}}));
    assert.match(image.getAttribute('src'),/new-final\.png/);assert.deepEqual(revoked,['blob:preview-1','blob:preview-2']);
  }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.close();}
});
