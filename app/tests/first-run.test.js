import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupFirstRun} from '../first_run.js';

test('Первый запуск показывает backend и недостающую модель, затем проверяет снова', async()=>{
  const dom=new JSDOM('<button id="first-run-open">Первый запуск</button>',{url:'http://localhost:8197/prism/'});
  const doc=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let models=[];
  try{
    const guide=setupFirstRun({doc,storage:dom.window.localStorage,readiness:async()=>({backend:'http://localhost:8197',version:'0.34.0',models})});
    dom.window.localStorage.setItem('matrix_dashboard_v3','{}');
    await guide.openIfNeeded();
    assert.equal(doc.querySelector('dialog').open,true);
    assert.match(doc.querySelector('[data-backend]').textContent,/localhost:8197/);
    assert.match(doc.querySelector('[data-models]').textContent,/Модель не найдена/);
    assert.equal(doc.querySelector('[data-example]').disabled,true);
    models=[{name:'sd_xl_base_1.0.safetensors',recipe:'checkpoint'}];
    await guide.check();
    assert.match(doc.querySelector('[data-models]').textContent,/sd_xl_base_1.0/);
    assert.equal(doc.querySelector('[data-example]').disabled,false);
    doc.querySelector('[data-close]').click();
    assert.equal(doc.querySelector('dialog').open,false);
    await guide.openIfNeeded();
    assert.equal(doc.querySelector('dialog').open,false);
  }finally{dom.window.close();}
});

test('Ошибка backend блокирует прежний пример, а кнопка помощи позволяет проверить подключение снова',async()=>{
  const dom=new JSDOM('<button id="first-run-open">Первый запуск</button>',{url:'http://localhost:8197/prism/'}),doc=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let disconnected=false,example=null;
  try{
    const guide=setupFirstRun({doc,storage:dom.window.localStorage,
      readiness:async()=>{if(disconnected)throw new Error('HTTP 503');return {backend:doc.location.origin,version:'0.34.0',models:[{name:'broken.safetensors',reason:'Нет энкодера',recipe:'anima'},{name:'sdxl.safetensors',recipe:'checkpoint'}]};},
      applyExample:name=>{example=name;}});
    await guide.open();
    doc.querySelector('[data-example]').click();
    assert.equal(example,'sdxl.safetensors');
    assert.equal(doc.querySelector('dialog').open,false);
    disconnected=true;await guide.open();
    assert.equal(doc.querySelector('[data-example]').disabled,true);
    assert.match(doc.querySelector('[data-error]').textContent,/HTTP 503/);
  }finally{dom.window.close();}
});
