import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Старый результат правки остаётся виден, но его рецепт больше нельзя запустить',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;
  try {
    const gallery=await import('../gallery.js');gallery.initGalleryEvents();
    for(const [filename,settings] of [['old-edit.png',{operation:'image-edit',seed:42}],['old-qwen.png',{operation:'txt2img',recipe:'qwen-image-2.1',seed:42}]]) {
      const output={filename,subfolder:'Prism',type:'output'};
      gallery.displayOutputImage({promptId:filename,settings,workflow:{},outputs:[output]});
      assert.ok(document.getElementById('output-image').src.includes(filename));
      assert.equal(document.getElementById('download-btn').disabled,false);
      assert.equal(document.getElementById('repeat-btn').disabled,true);
      assert.equal(document.getElementById('apply-prompt-btn').disabled,true);
    }
  } finally {dom.window.close();}
});
