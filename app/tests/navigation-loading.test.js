import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Загрузка галереи не отменяет выбранный пользователем раздел', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  for(const key of ['window','document','CustomEvent','Event','Option','localStorage'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  try {
    let resolveCatalog;
    const catalog=new Promise(resolve=>{resolveCatalog=resolve;});
    const {initArchiveGallery}=await import('../archive_gallery.js');
    const loading=initArchiveGallery({fetchImpl:()=>catalog,migrate:false});
    document.querySelector('[data-app-view="editor"]').click();
    assert.equal(document.body.dataset.appView,'editor');
    resolveCatalog(Response.json({version:3,items:[],operations:[]}));
    await loading;
    assert.equal(document.body.dataset.appView,'editor','Окончание загрузки сохраняет выбор пользователя');
    assert.equal(document.getElementById('editor-view').hidden,false);
  } finally { dom.window.close(); }
});
