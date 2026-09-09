import test from 'node:test';
import assert from 'node:assert/strict';
import {promptPartsFromSettings,resolvePromptParts} from '../prompt_parts.js';
import {compileWorkflow} from '../workflow.js';
import {JSDOM} from 'jsdom';
import {createPromptEditor} from '../prompt_editor.js';

const character={name:'Isabella',lora:'Character/Isabella.safetensors',strength:0.8,trigger:'IsabellaGarciaShapiro',appearances:{Base:'black hair, blue eyes'},activeAppearanceName:'Base',outfits:{Day:'pink dress'},activeOutfitName:'Day',outfitEnabled:false};
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
    assert.equal(editor.root.querySelector('[data-character-field="trigger"]'),null,'Триггер добавляется в генерацию без отдельной видимой плашки');
    assert.ok(editor.root.querySelector('.prompt-character-head use[href="#icon-person"]'),'Плашку обозначает значок персонажа');
    appearance.textContent='black hair, green eyes';appearance.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    editor.root.querySelector('.prompt-character-head').click();
    const toggle=dom.window.document.querySelector('[aria-label="Включить одежду"]');toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));
    const snapshot=editor.read();
    assert.equal(resolvePromptParts(snapshot).text,'IsabellaGarciaShapiro, black hair, green eyes, pink dress');
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
