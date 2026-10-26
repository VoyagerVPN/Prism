import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Галерея передаёт в редактор выбранный кадр, а сетку серии открыть для правки нельзя',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;
  try {
    const gallery=await import('../gallery.js');gallery.initGalleryEvents();
    const outputs=['first.png','second.png'].map(filename=>({filename,subfolder:'Prism',type:'output'}));
    const grid={filename:'grid.png',subfolder:'Prism',type:'output'};
    gallery.displayOutputImage({promptId:'series-edit',settings:{seed:42,batchCount:2},workflow:{},outputs:[...outputs,grid],gridOutput:grid});
    const edit=document.getElementById('output-edit-btn');
    assert.ok(edit,'Редактор доступен из галереи Prism');
    assert.equal(edit.disabled,true);
    const sent=[];window.addEventListener('edit-source-image',event=>sent.push(event.detail));
    gallery.selectHistoryItem(gallery.selectedHistoryItem,2);edit.click();
    assert.deepEqual(sent,[outputs[1]]);
  } finally {dom.window.close();}
});
