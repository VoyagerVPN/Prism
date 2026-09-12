import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { promptPartsFromSettings, resolvePromptParts } from '../prompt_parts.js';

test('Плашки LoRA показывают значки своих категорий',async()=>{
  const dom=new JSDOM('<textarea></textarea>');
  const {createPromptEditor}=await import('../prompt_editor.js');
  let entries=[];
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'),{getLoras:()=>entries});
  try{
    const categories={Character:'person',Concept:'bulb',Style:'brush',Clothing:'shirt',Pose:'pose',Object:'cube',Background:'landscape',Utility:'tool',Other:'tag'};
    editor.write(Object.keys(categories).map(category=>({type:'lora',name:`${category}/test.safetensors`,strength:1})));
    for(const token of editor.root.querySelectorAll('.prompt-lora'))assert.equal(token.querySelector('use')?.getAttribute('href'),'#icon-'+categories[token.dataset.name.split('/')[0]]);
    entries=[{name:'Other/test.safetensors',title:'Мой персонаж',category:'Character'}];editor.refreshLabels();
    assert.equal(editor.root.querySelector('[data-name="Other/test.safetensors"] use').getAttribute('href'),'#icon-person','Назначенная категория обновляет уже добавленную плашку');
    const snapshot=editor.read();editor.write(snapshot);
    assert.equal(editor.root.querySelector('[data-name="Other/test.safetensors"] use').getAttribute('href'),'#icon-person','Снимок с прежним путём получает текущую категорию библиотеки');
  }finally{editor.destroy();dom.window.close();}
});

test('Последний пробел перед LoRA удаляется без браузерного переноса строки',async()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true});
  const {createPromptEditor}=await import('../prompt_editor.js');
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    editor.write([{type:'text',text:' '},{type:'lora',name:'a.safetensors',strength:1},{type:'text',text:'\nintentional'}]);
    const range=dom.window.document.createRange();range.setStart(editor.root.firstChild,1);range.collapse(true);dom.window.getSelection().addRange(range);
    const event=new dom.window.InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true});editor.root.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true,'Удаление не передаётся браузеру, добавляющему BR');
    assert.equal(resolvePromptParts(editor.read()).text,'\nintentional');
    assert.equal(resolvePromptParts(editor.read()).loras.length,1);
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(editor.read()).text,' \nintentional');
  }finally{editor.destroy();dom.window.close();}
});

test('@ ищет LoRA и заменяет упоминание плашкой, Escape сохраняет текст',async()=>{
  const dom=new JSDOM('<textarea>portrait </textarea>',{pretendToBeVisual:true});
  const {createPromptEditor}=await import('../prompt_editor.js');
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'),{getLoras:()=>[{name:'Style/soft.safetensors',title:'Мягкий стиль'},{name:'Utility/light.safetensors',title:'Мой свет'},{name:'Character/source.safetensors',title:'Источник персонажа',mention:false}]});
  const type=text=>{
    editor.write([{type:'text',text}]);const node=editor.root.firstChild;
    const range=dom.window.document.createRange();range.setStart(node,node.length);range.collapse(true);
    dom.window.getSelection().removeAllRanges();dom.window.getSelection().addRange(range);
    editor.root.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  };
  try{
    type('portrait @Мой');
    const list=dom.window.document.querySelector('[role="listbox"]');assert.ok(list&&!list.hidden);
    assert.match(list.textContent,/Мой свет/);assert.doesNotMatch(list.textContent,/light|soft/);
    type('portrait @Источник');assert.equal(list.querySelectorAll('[role="option"]').length,0,'Character LoRA без профиля сохраняет имя, но не подключается как обычная LoRA');
    type('portrait @Мой');
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(editor.read()).text,'portrait ');
    assert.deepEqual(resolvePromptParts(editor.read()).loras,[{name:'Utility/light.safetensors',strength:1}]);
    assert.equal(editor.root.querySelector('.prompt-lora-name').textContent,'Мой свет');
    type('portrait @light');assert.equal(list.querySelectorAll('[role="option"]').length,0,'Имя файла не участвует в поиске');
    type('mail@example.org');assert.equal(list.hidden,true);
    type('portrait @soft');editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(list.hidden,true);assert.equal(resolvePromptParts(editor.read()).text,'portrait @soft');
    type('portrait @');editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(editor.read()).loras[0].name,'Utility/light.safetensors');
  }finally{editor.destroy();dom.window.close();}
});

test('Старый промпт и описания LoRA переносятся без потери текста',()=>{
  const parts=promptPartsFromSettings({positive:'portrait',loras:[{name:'Style/a.safetensors',strength:0.7,description:'soft light'}]});
  assert.equal(resolvePromptParts(parts).text,'portrait, soft light');
  assert.deepEqual(resolvePromptParts(parts).loras,[{name:'Style/a.safetensors',strength:0.7}]);
  assert.deepEqual(promptPartsFromSettings({positive:'stale',positiveParts:parts}),parts);
});

test('Inline редактор: LoRA среди текста, вес, удаление, undo и восстановление',async()=>{
  const dom=new JSDOM('<textarea id="positive-prompt">portrait</textarea>',{pretendToBeVisual:true});
  const {createPromptEditor}=await import('../prompt_editor.js');
  const field=dom.window.document.querySelector('textarea');let changed;
  const editor=createPromptEditor(field,{onChange:parts=>{changed=parts;}});
  try{
    editor.write([{type:'text',text:'before '},{type:'lora',name:'Style/a.safetensors',strength:0.8},{type:'text',text:' after\nnext'}]);
    assert.equal(field.value,'before  after\nnext');
    const remove=editor.root.querySelector('.prompt-lora-remove');
    assert.ok(remove,'У подключённой LoRA есть доступная мышью кнопка удаления');
    assert.match(remove.getAttribute('aria-label'),/Убрать контент/);
    assert.equal(editor.root.querySelector('input'),null,'Вес отображается без числового поля');
    const selected=editor.root.querySelector('.prompt-lora');selected.click();
    for(let step=0;step<22;step++)selected.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'-',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(changed).loras[0].strength,-0.3);
    selected.dispatchEvent(new dom.window.WheelEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(changed).loras[0].strength,-0.25);
    selected.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'-',ctrlKey:true,bubbles:true,cancelable:true}));
    const token=editor.root.querySelector('.prompt-lora');remove.click();
    assert.equal(resolvePromptParts(editor.read()).loras.length,0);assert.equal(field.value,'before  after\nnext');
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(resolvePromptParts(editor.read()).loras[0].strength,-0.3);
    const snapshot=editor.read();editor.write([{type:'text',text:'different'}]);editor.write(snapshot);assert.deepEqual(editor.read(),snapshot);
    editor.syncLoras([{name:'Style/a.safetensors',strength:1.2},{name:'Style/b.safetensors',strength:0.5}]);
    assert.equal(resolvePromptParts(editor.read()).loras.length,2);assert.equal(field.value,'before  after\nnext');
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{getData:type=>type==='text/plain'?'<img src=x onerror=bad>':''}});editor.root.dispatchEvent(paste);
    assert.equal(editor.root.querySelector('img'),null);assert.match(field.value,/<img src=x onerror=bad>/);
  }finally{editor.destroy();dom.window.close();}
});
