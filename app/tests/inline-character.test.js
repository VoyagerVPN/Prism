import test from 'node:test';
import assert from 'node:assert/strict';
import {promptPartsFromSettings,resolvePromptParts,normalizePromptParts,characterPromptPart} from '../prompt_parts.js';
import {compileWorkflow} from '../workflow.js';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {createPromptEditor} from '../prompt_editor.js';

const character={name:'Isabella',lora:'Character/Isabella.safetensors',strength:0.8,trigger:'IsabellaGarciaShapiro',appearances:{Base:'black hair, blue eyes'},activeAppearanceName:'Base',outfits:{Day:'pink dress'},activeOutfitName:'Day',outfitEnabled:false};
test('Выключенные теги принадлежат экземпляру и варианту, сохраняются в снимке и не компилируются',()=>{
  const source={...character,appearances:{Base:'black hair, (blue eyes, bright eyes:1.2)',Night:'black hair, red eyes'},outfitEnabled:true};
  const part=characterPromptPart(source,{framePrompt:'sitting',disabledTags:[{kind:'appearance',variant:'Base',tag:'(blue eyes, bright eyes:1.2)'},{kind:'outfit',variant:'Day',tag:'pink dress'}]});
  const graph=compileWorkflow({recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:[part]});
  assert.equal(graph['5'].inputs.text,'IsabellaGarciaShapiro, black hair, sitting');
  assert.deepEqual(normalizePromptParts(JSON.parse(JSON.stringify([part]))),[part]);
  const next=structuredClone(part);next.character.activeAppearanceName='Night';
  assert.equal(resolvePromptParts([next]).text,'IsabellaGarciaShapiro, black hair, red eyes, sitting');
  assert.equal(source.outfits.Day,'pink dress');
  assert.throws(()=>characterPromptPart(source,{disabledTags:[{kind:'unknown',variant:'Base',tag:'black hair'}]}),/тег/);
});
test('Теги раскрываются только у внешности и одежды: глазик исключает из промпта, нажатие редактирует, история сохраняет',async()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true,runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    editor.write([characterPromptPart({...character,outfitEnabled:true},{framePrompt:'sitting'})]);
    editor.root.querySelector('.prompt-character-head').dispatchEvent(new dom.window.Event('pointerenter'));
    assert.equal(dom.window.document.querySelector('[aria-label="Теги персонажа"]'),null,'Имя персонажа не дублирует оба списка тегов');
    editor.root.querySelector('[data-character-variant="appearance"]').dispatchEvent(new dom.window.Event('pointerenter'));
    const panel=dom.window.document.querySelector('[aria-label="Теги персонажа"]');
    assert.ok(panel,'Теги доступны без щелчка по карточке');
    assert.equal(panel.querySelectorAll('.prompt-tags .tagify__tag').length,2);
    assert.ok(panel.querySelector('use[href="#icon-palette"]'),'Тот же тег с иконкой, что и в библиотеке');
    panel.querySelector('[aria-label="Исключить тег blue eyes"]').click();
    assert.equal(resolvePromptParts(editor.read()).text,'IsabellaGarciaShapiro, black hair, pink dress, sitting');
    [...panel.querySelectorAll('.tagify__tag-text')].find(el=>el.textContent==='blue eyes').click();
    const input=panel.querySelector('.tagify__tag--editable .tagify__tag-text');assert.ok(input,'Один щелчок начинает редактирование');
    input.textContent='';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.textContent='green eyes';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.blur();
    assert.equal(resolvePromptParts(editor.read()).text,'IsabellaGarciaShapiro, black hair, pink dress, sitting','Правка выключенного тега не включает его');
    panel.querySelector('[aria-label="Вернуть тег green eyes"]').click();
    const snapshot=editor.read();assert.equal(resolvePromptParts(snapshot).text,'IsabellaGarciaShapiro, black hair, green eyes, pink dress, sitting');
    editor.write(JSON.parse(JSON.stringify(snapshot)));assert.deepEqual(editor.read(),snapshot);
    assert.equal(character.appearances.Base,'black hair, blue eyes');
  }finally{editor.destroy();dom.window.close();}
});
test('Карточка сохраняет правильную иерархию, а пустой промпт кадра не оставляет фантомный пробел',()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true});
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    editor.write([characterPromptPart({...character,name:'Очень длинное имя персонажа для проверки иерархии'})]);
    const card=editor.root.querySelector('.prompt-character'),summary=card.querySelector('.prompt-character-summary'),frame=card.querySelector('.prompt-frame');
    assert.deepEqual([...summary.children].map(element=>element.className),['prompt-character-head','prompt-character-variant','prompt-character-variant']);
    assert.equal(card.querySelector('.prompt-character-name').title,'Очень длинное имя персонажа для проверки иерархии');
    assert.equal(frame.parentElement,card,'Промпт кадра не участвует в сжатии заголовка и вариантов');
    assert.equal(frame.classList.contains('is-empty'),true);
    const field=frame.querySelector('[data-character-field="frame"]');field.textContent='sitting';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(frame.classList.contains('is-empty'),false);
  }finally{editor.destroy();dom.window.close();}
});
test('Выделенная часть карточки переключается колесом, сохраняя кадр и отмену',()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true});
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    const source={...character,appearances:{Base:'black hair',Night:'silver hair'},outfits:{Day:'pink dress',Night:'black coat'},outfitEnabled:true};
    const first=characterPromptPart(source,{framePrompt:'sitting'}),second=characterPromptPart(source,{framePrompt:'standing'});
    editor.write([first,{type:'text',text:', '},second]);
    const control=kind=>editor.root.querySelector(kind==='character'?'.prompt-character-head':`[data-character-variant="${kind}"]`);
    const wheel=kind=>{const event=new dom.window.WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});control(kind).dispatchEvent(event);return event.defaultPrevented;};
    assert.equal(wheel('appearance'),false,'Без выделения обычное колесо прокручивает страницу');
    control('appearance').click();
    assert.equal(control('appearance').getAttribute('aria-pressed'),'true');
    assert.equal(dom.window.document.querySelector('.prompt-character-options'),null,'Первый щелчок выделяет без открытия меню');
    assert.equal(wheel('appearance'),true);
    assert.equal(editor.read()[0].character.activeAppearanceName,'Night');
    assert.equal(editor.read()[0].framePrompt,'sitting');assert.equal(editor.read()[2].character.activeAppearanceName,'Base');
    control('outfit').click();wheel('outfit');
    assert.equal(editor.read()[0].character.activeOutfitName,'Night');
    wheel('outfit');assert.equal(editor.read()[0].character.outfitEnabled,false,'Колесо включает состояние без одежды');
    wheel('outfit');assert.equal(editor.read()[0].character.activeOutfitName,'Day');assert.equal(editor.read()[0].character.outfitEnabled,true);
    control('character').click();wheel('character');
    assert.equal(dom.window.getSelection().isCollapsed,true,'Выбор карточки не выделяет её подписи как текст');
    const copied=new Map(),copyEvent=new dom.window.Event('copy',{bubbles:true,cancelable:true});
    Object.defineProperty(copyEvent,'clipboardData',{value:{setData:(type,value)=>copied.set(type,value)}});editor.root.dispatchEvent(copyEvent);
    assert.equal(JSON.parse(copied.get('application/x-prism-prompt'))[0].instanceId,first.instanceId,'Карточка копируется целиком без текстового выделения');
    assert.deepEqual(editor.read().filter(part=>part.type==='character').map(part=>part.character.strength),[0.75,0.75]);
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'+',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(editor.read()[0].character.strength,0.8,'Клавиши работают, когда Chromium перенёс фокус на редактор');
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(editor.read()[0].character.strength,0.75);
    control('appearance').click();control('appearance').click();
    assert.ok(dom.window.document.querySelector('.prompt-character-options'),'Повторный щелчок открывает выбор');
    control('character').click();
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
    assert.deepEqual(editor.read().filter(part=>part.type==='character').map(part=>part.framePrompt),['standing'],'Удаление выделенного блока сохраняет соседний');
  }finally{editor.destroy();dom.window.close();}
});

test('Два экземпляра одного персонажа имеют независимые ID и теги кадра',()=>{
  const first=characterPromptPart(character,{framePrompt:'annoyed, sitting'}),second=characterPromptPart(character,{framePrompt:'smiling, standing'});
  assert.notEqual(first.instanceId,second.instanceId);
  const parts=normalizePromptParts([first,{type:'text',text:', '},second]);
  assert.equal(parts.filter(part=>part.type==='character').length,2);
  assert.deepEqual(normalizePromptParts(JSON.parse(JSON.stringify(parts))),parts);
  assert.equal(resolvePromptParts(parts).text,'IsabellaGarciaShapiro, black hair, blue eyes, annoyed, sitting, IsabellaGarciaShapiro, black hair, blue eyes, smiling, standing');
  assert.equal(resolvePromptParts(parts).loras.length,1);
  const renamed=structuredClone(parts);renamed[0].character.name='Другое имя';
  assert.equal(normalizePromptParts(renamed)[0].instanceId,first.instanceId);
});

test('Сохранённый шаблон обновляет все активные экземпляры, не стирая состояние кадра',()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true});
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    const first=characterPromptPart(character,{framePrompt:'sitting',disabledTags:[{kind:'appearance',variant:'Base',tag:'blue eyes'}]});
    const second=characterPromptPart(character,{framePrompt:'standing'});
    editor.write([first,{type:'text',text:', '},second]);
    const updated={...character,name:'Isabella Prime',appearances:{Base:'black hair, amber scarf, blue eyes'}};
    editor.syncCharacter('Isabella',updated);
    const parts=editor.read().filter(part=>part.type==='character');
    assert.deepEqual(parts.map(part=>part.character.name),['Isabella Prime','Isabella Prime']);
    assert.deepEqual(parts.map(part=>part.framePrompt),['sitting','standing']);
    assert.deepEqual(parts.map(part=>part.instanceId),[first.instanceId,second.instanceId]);
    assert.deepEqual(parts[0].disabledTags,first.disabledTags);
    assert.match(dom.window.document.querySelector('textarea').value,/amber scarf/);
  }finally{editor.destroy();dom.window.close();}
});
test('Персонаж переносится в промпт целиком, снимок компилируется без дублирования',()=>{
  const parts=promptPartsFromSettings({positive:'portrait',character});
  assert.equal(parts.filter(part=>part.type==='character').length,1);
  assert.equal(resolvePromptParts(parts).text,'portrait, IsabellaGarciaShapiro, black hair, blue eyes');
  const snapshot=JSON.parse(JSON.stringify(parts));
  snapshot.find(part=>part.type==='character').character.outfitEnabled=true;
  const settings={recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:snapshot,character};
  const graph=compileWorkflow(settings);
  assert.equal(graph['5'].inputs.text,'portrait, IsabellaGarciaShapiro, black hair, blue eyes, pink dress');
  const loras=Object.values(graph).filter(node=>node.class_type==='LoraLoader');
  assert.equal(loras.length,1);assert.equal(loras[0].inputs.strength_model,0.8);
  assert.equal(character.outfitEnabled,false,'Исходный шаблон остаётся неизменным');
});

test('@ вставляет персонажа, теги редактируются в промпте, одежда и история сохраняют черновик',()=>{
  const dom=new JSDOM('<textarea>@Isa</textarea>',{pretendToBeVisual:true});
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'),{getLoras:()=>[{name:character.lora,title:'Isabella',character}]});
  try{
    const range=dom.window.document.createRange();range.selectNodeContents(editor.root);range.collapse(false);
    const node=editor.root.firstChild;range.setStart(node,node.length);range.collapse(true);dom.window.getSelection().addRange(range);
    editor.root.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const appearance=editor.root.querySelector('[data-character-field="appearance"]');
    assert.ok(appearance,'Теги внешности находятся в основном промпте');
    assert.equal(appearance.closest('.prompt-character-group').hidden,true,'Базовая внешность свёрнута');
    const frame=editor.root.querySelector('[data-character-field="frame"]');
    assert.ok(frame,'Теги кадра доступны без меню');
    frame.textContent='annoyed, sitting';frame.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(editor.root.querySelector('[data-character-variant="appearance"]').textContent,'Base');
    assert.equal(editor.root.querySelector('[data-character-field="trigger"]'),null,'Триггер добавляется в генерацию без отдельной видимой плашки');
    assert.ok(editor.root.querySelector('.prompt-character-head use[href="#icon-person"]'),'Плашку обозначает значок персонажа');
    appearance.textContent='black hair, green eyes';appearance.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    editor.root.querySelector('.prompt-character-head').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const toggle=dom.window.document.querySelector('[aria-label="Включить одежду"]');toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));
    const snapshot=editor.read();
    assert.equal(resolvePromptParts(snapshot).text,'IsabellaGarciaShapiro, black hair, green eyes, pink dress, annoyed, sitting');
    editor.write([]);editor.write(JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(editor.read(),snapshot);
    assert.equal(character.appearances.Base,'black hair, blue eyes');
  }finally{editor.destroy();dom.window.close();}
});

test('LoRA персонажа заменяет отдельное подключение и сохраняет вес персонажа',()=>{
  const parts=promptPartsFromSettings({positiveParts:[{type:'lora',name:character.lora,strength:0.2},{type:'character',character}]});
  assert.deepEqual(resolvePromptParts(parts).loras,[{name:character.lora,strength:0.8}]);
  assert.equal(parts.filter(part=>part.type==='lora').length,0);
});

test('Копия блока получает новый ID, правки двух экземпляров и undo независимы',()=>{
  const dom=new JSDOM('<textarea></textarea>',{pretendToBeVisual:true});
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    const first=characterPromptPart(character,{framePrompt:'sitting'});editor.write([first]);
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{getData:type=>type==='application/x-prism-prompt'?JSON.stringify([first]):''}});editor.root.dispatchEvent(paste);
    const parts=editor.read();assert.equal(parts.length,2);assert.notEqual(parts[0].instanceId,parts[1].instanceId);
    const fields=editor.root.querySelectorAll('[data-character-field="frame"]');fields[1].textContent='standing';fields[1].dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(editor.read()[0].framePrompt,'sitting');assert.equal(editor.read()[1].framePrompt,'standing');
    editor.root.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.deepEqual(editor.read(),parts);
  }finally{editor.destroy();dom.window.close();}
});

test('Вес одной LoRA общий для её экземпляров; противоречивый импорт отклоняется',()=>{
  const dom=new JSDOM('<textarea></textarea>'),editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    editor.write([characterPromptPart(character),{type:'text',text:', '},characterPromptPart(character)]);
    editor.root.querySelector('.prompt-character-head').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'-',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.deepEqual(editor.read().filter(part=>part.type==='character').map(part=>part.character.strength),[0.75,0.75]);
    assert.throws(()=>compileWorkflow({recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:[characterPromptPart(character),characterPromptPart({...character,strength:0.2})]}),/общий вес/);
  }finally{editor.destroy();dom.window.close();}
});
