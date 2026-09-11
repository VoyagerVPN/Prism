import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {makeDialogBackdropDismissible,makeDetailsOutsideDismissible} from '../popup_behavior.js';

test('Перетаскивание из окна на подложку не закрывает модальное окно',()=>{
  const dom=new JSDOM('<dialog open><input value="Выделяемый текст"></dialog>'),dialog=dom.window.document.querySelector('dialog');
  dialog.getBoundingClientRect=()=>({left:100,top:100,right:300,bottom:260});
  dialog.close=function(){this.open=false;};
  const pointer=(target,type,x,y)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y}));
  try{
    makeDialogBackdropDismissible(dialog);
    pointer(dialog.querySelector('input'),'pointerdown',150,150);
    pointer(dialog,'pointerup',40,40);
    pointer(dialog,'click',40,40);
    assert.equal(dialog.open,true,'Выделение текста с отпусканием на подложке сохраняет окно');
    pointer(dialog,'pointerdown',150,150);
    pointer(dialog,'click',40,40);
    assert.equal(dialog.open,true,'Начало во внутреннем отступе также сохраняет окно');
    pointer(dialog,'pointerdown',40,40);
    pointer(dialog,'pointercancel',40,40);
    pointer(dialog,'click',40,40);
    assert.equal(dialog.open,true,'Отменённый жест не закрывает окно');
    pointer(dialog,'pointerdown',40,40);
    pointer(dialog,'click',40,40);
    assert.equal(dialog.open,false,'Новый щелчок, начатый на подложке, закрывает окно');
  }finally{dom.window.close();}
});

test('Модальное окно закрывается только при щелчке за его пределами',()=>{
  const dom=new JSDOM('<dialog open><form><button type="button">Внутри</button></form></dialog>'),doc=dom.window.document,dialog=doc.querySelector('dialog');
  dialog.getBoundingClientRect=()=>({left:100,top:100,right:300,bottom:260,width:200,height:160,x:100,y:100,toJSON(){return this;}});
  dialog.close=function(){this.open=false;};
  try{
    makeDialogBackdropDismissible(dialog);
    dialog.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:150,clientY:150}));
    assert.equal(dialog.open,true,'Щелчок по содержимому не закрывает окно');
    dialog.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:150,clientY:150}));
    assert.equal(dialog.open,true,'Щелчок по внутреннему отступу не считается подложкой');
    dialog.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:40,clientY:40}));
    dialog.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:40,clientY:40}));
    assert.equal(dialog.open,false,'Щелчок по подложке закрывает окно');
  }finally{dom.window.close();}
});

test('Модальное окно уважает запрет закрытия в событии cancel',()=>{
  const dom=new JSDOM('<dialog open></dialog>'),dialog=dom.window.document.querySelector('dialog');
  dialog.getBoundingClientRect=()=>({left:100,top:100,right:300,bottom:260,width:200,height:160,x:100,y:100,toJSON(){return this;}});
  dialog.close=function(){this.open=false;};
  try{
    dialog.addEventListener('cancel',event=>event.preventDefault());
    makeDialogBackdropDismissible(dialog);
    dialog.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:40,clientY:40}));
    dialog.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:40,clientY:40}));
    assert.equal(dialog.open,true);
  }finally{dom.window.close();}
});

test('Всплывающее меню details закрывается внешним pointerdown',()=>{
  const dom=new JSDOM('<details open><summary>Открыть</summary><button>Внутри</button></details><button id="outside">Снаружи</button>'),doc=dom.window.document,details=doc.querySelector('details');
  try{
    const dispose=makeDetailsOutsideDismissible(details);
    details.querySelector('button').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));
    assert.equal(details.open,true,'Действие внутри не закрывается раньше обработки клика');
    doc.querySelector('#outside').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));
    assert.equal(details.open,false);
    dispose();
  }finally{dom.window.close();}
});
