import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('Статус генерации не занимает место в покое и появляется только для прогресса',async()=>{
  const dom=new JSDOM('<body><i id="status-dot"></i><span id="status-text"></span><div id="progress-container"></div><div class="action-status-info"><span id="progress-label"></span><span id="progress-sub"></span></div><div id="progress-bar-fill"></div></body>',{url:'http://localhost/prism/'});
  const keys=['window','document'];
  for(const key of keys)globalThis[key]=dom.window[key];
  try{
    const {updateStatus,showProgress}=await import(`../status.js?test=${Date.now()}`);
    showProgress('Кадр 1/2','Диффузия · 35%',35);
    const info=document.querySelector('.action-status-info');
    assert.equal(info.hidden,false);
    assert.equal(document.getElementById('progress-label').textContent,'Кадр 1/2');
    updateStatus('connected','Подключено');
    assert.equal(info.hidden,true);
    assert.equal(document.getElementById('progress-label').textContent,'');
    assert.equal(document.getElementById('progress-sub').textContent,'');
  }finally{
    dom.window.close();
    for(const key of keys)delete globalThis[key];
  }
});
