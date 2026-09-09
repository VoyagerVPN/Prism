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
