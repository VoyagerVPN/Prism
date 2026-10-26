import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {initImageEditor} from '../image_editor.js';

test('Обновление доступности не включает сравнение до получения результата', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const info=JSON.parse(await readFile(new URL('./fixtures/image-edit-info.json',import.meta.url),'utf8'));
  globalThis.window=dom.window; globalThis.document=dom.window.document;
  try {
    const editor=initImageEditor();
    editor.useSource({filename:'original.png',type:'output'});
    editor.updateAvailability(info,false);
    assert.equal(document.getElementById('edit-show-result').disabled,true,'Исходник ещё не имеет результата для сравнения');
    editor.showResult({settings:{steps:8,seed:42},outputs:[{filename:'edited.png',type:'output'}]});
    editor.updateAvailability(info,true);
    assert.equal(document.getElementById('edit-show-result').disabled,true,'Сравнение заблокировано во время обработки');
    editor.updateAvailability(info,false);
    assert.equal(document.getElementById('edit-show-result').disabled,false,'Готовый результат снова доступен');
  } finally { dom.window.close(); }
});

test('Переход к сохранённому исходнику освобождает загруженное фото и позволяет выбрать его снова', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const objectUrl=URL.createObjectURL, revoke=URL.revokeObjectURL;
  const released=[];
  URL.createObjectURL=()=> 'blob:uploaded-photo';
  URL.revokeObjectURL=url=>released.push(url);
  globalThis.window=dom.window; globalThis.document=dom.window.document;
  try {
    const editor=initImageEditor();
    const input=document.getElementById('edit-source-file');
    Object.defineProperty(input,'files',{value:[new dom.window.File(['photo'],'person.png',{type:'image/png'})]});
    Object.defineProperty(input,'value',{value:'C:\\fakepath\\person.png',writable:true});
    input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    editor.useSource({filename:'saved.png',type:'output'});
    assert.deepEqual(released,['blob:uploaded-photo'],'Предыдущее фото больше не удерживается в памяти');
    assert.equal(input.value,'','Повторный выбор прежнего файла должен вызывать change');
  } finally { URL.createObjectURL=objectUrl; URL.revokeObjectURL=revoke; dom.window.close(); }
});

test('Повторное открытие того же исходника очищает прежнее выделение', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window; globalThis.document=dom.window.document;
  try {
    const canvas=document.getElementById('edit-mask-canvas');
    let selected=false;
    // Модель bitmap Canvas: назначение width очищает пиксели по контракту браузера.
    const width=Object.getOwnPropertyDescriptor(dom.window.HTMLCanvasElement.prototype,'width');
    Object.defineProperty(canvas,'width',{get:()=>width.get.call(canvas),set:value=>{width.set.call(canvas,value);selected=false;}});
    const context={beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){selected=true;},getImageData(){return {data:new Uint8ClampedArray([255,255,255,selected?255:0])};}};
    canvas.getContext=()=>context;
    canvas.setPointerCapture=()=>{};
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
    const editor=initImageEditor();
    const image={filename:'same.png',type:'output'};
    editor.useSource(image);
    document.getElementById('edit-local').checked=true;
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown',{button:0,clientX:50,clientY:50}));
    assert.equal(context.getImageData().data[3],255,'Пользователь видит нарисованное выделение');
    editor.useSource(image);
    assert.equal(context.getImageData().data[3],0,'Сброшенное выделение не должно оставаться видимым');
  } finally { dom.window.close(); }
});

test('Восстановление параметров для уже загруженного исходника показывает сохранённую маску', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  globalThis.window=dom.window; globalThis.document=dom.window.document;
  try {
    const requested=[];
    dom.window.Image=class { set src(value){requested.push(value);} };
    const stage=document.getElementById('edit-stage-image');
    Object.defineProperties(stage,{complete:{value:true},naturalWidth:{value:512},naturalHeight:{value:512}});
    const editor=initImageEditor();
    const settings={editSourceImage:'same.png [output]',maskImage:'mask-one.png',positive:'Change the selection.'};
    editor.restore(settings);
    requested.length=0;
    editor.restore({...settings,maskImage:'mask-two.png'});
    assert.equal(requested.length,1,'Для готового исходника не требуется новое событие load');
    assert.match(requested[0],/mask-two\.png/);
  } finally { dom.window.close(); }
});

test('Пользователь загружает фото и одежду в Prism и получает готовое задание редактирования', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const info=JSON.parse(await readFile(new URL('./fixtures/image-edit-info.json',import.meta.url),'utf8'));
  const objectUrl=URL.createObjectURL, revoke=URL.revokeObjectURL;
  URL.createObjectURL=()=> 'blob:test-photo';
  URL.revokeObjectURL=()=> {};
  globalThis.window=dom.window; globalThis.document=dom.window.document;
  try {
    const editor=initImageEditor({uploadImage:async file => file.name});
    const stability=document.getElementById('edit-stability-lora');
    assert.equal(stability.value,'consistency');
    assert.deepEqual([...stability.options].map(option=>option.textContent),['Outfit Swap','Consistency']);
    for (const [id,name] of [['edit-source-file','person.png'],['edit-reference-file','shirt.png']]) {
      const input=document.getElementById(id);
      Object.defineProperty(input,'files',{value:[new dom.window.File(['photo'],name,{type:'image/png'})],configurable:true});
      input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    }
    document.getElementById('edit-prompt').value='Put the shirt from <image2> on <image1>.';
    document.getElementById('edit-quality').value='draft';
    const result=await editor.prepareSubmission(info);
    assert.equal(result.settings.stabilityLora,'consistency');
    assert.equal(result.settings.editLora.strength,1);
    assert.equal(result.workflow['5'].inputs.image,'person.png');
    assert.equal(result.workflow['6'].inputs.image,'shirt.png');
    assert.equal(result.settings.steps,8);
    assert.equal(document.getElementById('edit-source-name').textContent,'person.png');
    assert.equal(document.querySelector('[data-app-view="editor"]').textContent.trim(),'Редактор');
    editor.showResult({settings:result.settings,outputs:[{filename:'edited.png',type:'output'}]});
    assert.match(document.getElementById('edit-result-image').src,/edited.png/);
    assert.equal(document.getElementById('edit-download').hidden,false);
    let changes=0;
    window.addEventListener('editor-change',()=>changes++);
    stability.value='outfit-swap';
    stability.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    assert.equal(changes,1,'Выбор LoRA обновляет доступность задания');
    const outfit=await editor.prepareSubmission(info);
    assert.equal(outfit.settings.stabilityLora,'outfit-swap');
    assert.match(outfit.settings.editLora.name,/outfit-swap\.safetensors$/);
    const onlyOutfit=structuredClone(info);
    onlyOutfit.LoraLoaderModelOnly.input.required.lora_name[0]=[outfit.settings.editLora.name];
    stability.value='consistency';
    assert.equal(editor.updateAvailability(onlyOutfit,false),false);
    assert.equal(document.getElementById('edit-submit').disabled,true);
    assert.match(document.getElementById('edit-capability').textContent,/consistency\.safetensors/);
    stability.value='outfit-swap';
    assert.equal(editor.updateAvailability(onlyOutfit,false),true);
    editor.restore(outfit.settings);
    assert.equal(stability.value,'outfit-swap');
    document.getElementById('edit-local').checked=true;
    await assert.rejects(()=>editor.prepareSubmission(info),/Выделите область/);
    editor.restore({operation:'image-edit',editSourceImage:'Prism/original.png [output]',referenceImage:'uploads/shirt.png',maskImage:'saved-mask.png',positive:'Change the shirt.',quality:'draft',seed:42,steps:8});
    assert.equal(stability.value,'consistency','Старое задание без выбора получает новый рабочий default');
    const restored=await editor.prepareSubmission(info);
    assert.equal(restored.workflow['5'].inputs.image,'Prism/original.png [output]');
    assert.equal(restored.workflow['6'].inputs.image,'uploads/shirt.png');
    assert.equal(restored.workflow['11'].inputs.image,'saved-mask.png');
    assert.match(document.getElementById('edit-reference-preview').src,/subfolder=uploads/);
    assert.equal(restored.settings.seed,42);
    editor.restore({...restored.settings,stabilityLora:undefined,editLora:{name:'QwenImage21/qwen-image-2.1-outfit-swap.safetensors',strength:1}});
    assert.equal(stability.value,'outfit-swap','Восстанавливаются и результаты прежнего сравнения');
    editor.showStatus('Не удалось выполнить правку.');
    assert.equal(document.getElementById('edit-message').textContent,'Не удалось выполнить правку.');
    editor.updateAvailability(info,true);
    editor.updateAvailability(info,false);
    assert.equal(document.getElementById('edit-message').textContent,'','Завершённое задание не остаётся в состоянии выполнения');
    editor.showResult({settings:restored.settings,outputs:[{filename:'another.png',type:'output'}]});
    editor.useSource({filename:'next.png',subfolder:'Prism',type:'output'});
    assert.equal(document.getElementById('edit-show-result').disabled,true,'Новый исходник не сравнивается с прежним результатом');
  } finally { URL.createObjectURL=objectUrl; URL.revokeObjectURL=revoke; dom.window.close(); }
});
