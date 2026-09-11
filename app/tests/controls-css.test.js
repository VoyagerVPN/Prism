import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('Кастомный чекбокс: выбор через label, состояния и независимость от переключателей',async()=>{
  const dom=new JSDOM('<body><label class="profile-source-tag"><input type="checkbox" id="tag"><span>Триггер</span></label><label class="switch"><input type="checkbox" id="toggle"><span class="slider"></span></label></body>');
  try{
    const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../controls.css',import.meta.url),'utf8');dom.window.document.head.append(style);
    const checkbox=dom.window.document.getElementById('tag'),computed=()=>dom.window.getComputedStyle(checkbox);
    assert.equal(computed().appearance,'none');assert.equal(computed().width,'18px');
    assert.equal(computed().backgroundImage,'none');
    dom.window.document.querySelector('.profile-source-tag span').click();assert.equal(checkbox.checked,true);
    checkbox.setAttribute('data-state','checked');const checkedImage=computed().backgroundImage;assert.notEqual(checkedImage,'none');
    checkbox.indeterminate=true;checkbox.setAttribute('data-state','indeterminate');assert.notEqual(computed().backgroundImage,checkedImage);
    checkbox.disabled=true;assert.equal(computed().cursor,'not-allowed');
    dom.window.document.querySelector('.profile-source-tag span').click();assert.equal(checkbox.checked,true);
    assert.notEqual(dom.window.getComputedStyle(dom.window.document.getElementById('toggle')).appearance,'none');
  }finally{dom.window.close();}
});

test('Обычные поля используют общее оформление, включая input без type и поиск', async()=>{
  const dom=new JSDOM('<body><input type="text" id="name"><input id="universe"><input type="search" id="search"><input type="number" id="number"><select id="select"><option>Один</option></select><textarea id="description"></textarea><input type="checkbox" id="check"><input type="range" id="range"></body>');
  try{
    for(const file of ['index.css','controls.css']){const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../'+file,import.meta.url),'utf8');dom.window.document.head.append(style);}
    const style=id=>dom.window.getComputedStyle(dom.window.document.getElementById(id));
    const reference=style('name');assert.equal(reference.height,'44px');
    for(const id of ['universe','search','number','select','description'])for(const property of ['backgroundColor','color','borderRadius','padding','fontSize','width'])assert.equal(style(id)[property],reference[property],`${id}: ${property}`);
    for(const id of ['universe','search','number','select'])assert.equal(style(id).height,'44px',id);
    for(const id of ['check','range'])assert.notEqual(style(id).backgroundColor,reference.backgroundColor,`${id} не должен получать оформление текстового поля`);
    const focused=dom.window.document.createElement('input');focused.id='focused';dom.window.document.body.append(focused);focused.focus();
    assert.notEqual(style('focused').boxShadow,reference.boxShadow,'У фокуса есть видимый индикатор');
  }finally{dom.window.close();}
});

test('Меню действий библиотеки использует тёмные пункты без системного оформления кнопок',async()=>{
  const dom=new JSDOM('<body><details class="library-actions" open><div class="library-actions-menu"><button id="add-character-btn" class="add-lora-btn">Создать персонажа</button></div></details></body>');
  try{
    for(const file of ['index.css','controls.css']){const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../'+file,import.meta.url),'utf8');dom.window.document.head.append(style);}
    const button=dom.window.document.querySelector('button'),computed=dom.window.getComputedStyle(button);
    assert.equal(computed.backgroundColor,'rgba(0, 0, 0, 0)');
    assert.equal(computed.color,'rgb(237, 240, 245)');
    assert.equal(computed.borderStyle,'none');
    assert.equal(computed.borderRadius,'6px');
    assert.equal(computed.fontWeight,'400');
  }finally{dom.window.close();}
});

test('Свободно плавающие меню используют одну поверхность',async()=>{
  const dom=new JSDOM('<body><div class="editable-choice-menu"></div><div class="prompt-character-options"></div><div class="prompt-mentions"></div><div class="library-actions-menu"></div></body>');
  try{
    const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../controls.css',import.meta.url),'utf8');dom.window.document.head.append(style);
    const surfaces=[...dom.window.document.body.children].map(element=>dom.window.getComputedStyle(element));
    for(const computed of surfaces){
      assert.equal(computed.backgroundColor,'rgb(27, 31, 39)');
      assert.equal(computed.borderTopColor,'rgb(52, 59, 71)');
      assert.equal(computed.borderRadius,'8px');
      assert.equal(computed.boxShadow,'0 10px 35px rgba(0, 0, 0, 0.533333)');
    }
  }finally{dom.window.close();}
});

test('Вся карточка остаётся однострочной, а слишком длинные подписи получают многоточие',async()=>{
  const dom=new JSDOM('<body><span class="prompt-character-summary"><span class="prompt-character-head"><span class="prompt-character-name">Очень длинное имя персонажа</span></span><span class="prompt-character-variant"></span><span class="prompt-character-variant"></span></span><span class="prompt-frame is-empty"><span data-character-field="frame"></span></span><span class="prompt-character-tags"><span class="prompt-tags"></span></span></body>');
  try{
    const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../controls.css',import.meta.url),'utf8');dom.window.document.head.append(style);
    const computed=selector=>dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(computed('.prompt-character-summary').flexWrap,'nowrap');
    assert.equal(computed('.prompt-character-summary').whiteSpace,'nowrap');
    assert.equal(computed('.prompt-character-summary').overflow,'hidden');
    assert.equal(computed('.prompt-character-summary').maxHeight,'22.4px');
    assert.equal(computed('.prompt-character-summary').verticalAlign,'baseline');
    assert.equal(computed('.prompt-character-summary').borderRadius,'4px');
    assert.equal(computed('.prompt-character-head').borderRadius,'4px 0 0 4px');
    assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.prompt-character-variant:last-child')).borderRadius,'0 4px 4px 0');
    assert.equal(computed('.prompt-character-head').flexShrink,'0','Короткое имя не теряет даже долю пикселя из-за соседних вариантов');
    assert.equal(computed('.prompt-character-head').maxWidth,'100%');
    assert.equal(computed('.prompt-character-head').overflow,'hidden');
    assert.equal(computed('.prompt-character-variant').flexShrink,'100','Варианты освобождают место короткому имени первыми');
    assert.equal(computed('.prompt-character-variant').overflow,'hidden');
    assert.equal(computed('.prompt-character-name').whiteSpace,'nowrap');
    assert.equal(computed('.prompt-character-name').overflow,'hidden');
    assert.equal(computed('.prompt-character-name').textOverflow,'ellipsis');
    assert.equal(computed('.prompt-frame').marginLeft,'0px');
    assert.equal(computed('.prompt-frame [data-character-field]').minWidth,'0px');
    assert.equal(computed('.prompt-character-tags').overflow,'visible');
    assert.equal(computed('.prompt-character-tags').maxHeight,'none');
    assert.equal(computed('.prompt-tags').flexDirection,'row');
    assert.equal(computed('.prompt-tags').flexWrap,'wrap');
  }finally{dom.window.close();}
});
