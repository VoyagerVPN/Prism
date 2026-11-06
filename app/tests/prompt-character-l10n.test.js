import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {createCharacterToken,characterOptions,localizeCharacterToken} from '../prompt_character.js';
import {characterPromptPart} from '../prompt_parts.js';
import {createPromptEditor} from '../prompt_editor.js';

test('карточка персонажа в промпте показывает английские подписи и сохраняет данные',async()=>{
  const dom=new JSDOM('');const doc=dom.window.document;
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  const character={name:'Алиса',lora:'None',strength:1,appearances:{'Базовая':'blue eyes'},activeAppearanceName:'Базовая',outfits:{'День':'coat'},activeOutfitName:'День',outfitEnabled:false};
  try{
    const token=createCharacterToken(characterPromptPart(character),{doc,onChange:()=>{},onSelect:()=>{},onHover:()=>{},onHoverEnd:()=>{},openOptions:()=>{}});
    assert.equal(token.querySelector('.prompt-character-head').getAttribute('aria-label'),'Character Алиса: variants and outfit');
    assert.equal(token.querySelector('[data-character-variant=outfit] .prompt-character-variant-name').textContent,'No outfit');
    const panel=characterOptions(token,{doc,onChange:()=>{},replace:()=>{},close:()=>{},onShowTags:()=>{}});
    assert.equal(panel.getAttribute('aria-label'),'Character variants');
    assert.equal(panel.querySelector('select').value,'Базовая');
    assert.equal(character.appearances.Базовая,'blue eyes');
    await l10n.changeLanguage('ru');localizeCharacterToken(token);
    assert.equal(token.querySelector('.prompt-character-head').getAttribute('aria-label'),'Персонаж Алиса: варианты и одежда');
    assert.equal(token.querySelector('[data-character-field=appearance]').textContent,'blue eyes');
    assert.equal(token.querySelector('[data-character-variant=outfit] .prompt-character-variant-name').textContent,'Без одежды');
  }finally{setActiveLocalization(null);dom.window.close();}
});

test('смена языка переводит уже вставленную карточку без замены промпта',async()=>{
  const dom=new JSDOM('<textarea></textarea>',{url:'http://localhost/',pretendToBeVisual:true});
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  const character={name:'Алиса',lora:'None',strength:1,appearances:{Base:'blue eyes'},activeAppearanceName:'Base',outfits:{Day:'coat'},activeOutfitName:'Day',outfitEnabled:true};
  const editor=createPromptEditor(dom.window.document.querySelector('textarea'));
  try{
    editor.write([characterPromptPart(character,{framePrompt:'sitting'})]);
    const token=editor.root.querySelector('.prompt-character'),before=editor.read();
    await l10n.changeLanguage('ru');dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.strictEqual(editor.root.querySelector('.prompt-character'),token);
    assert.equal(token.querySelector('.prompt-character-head').getAttribute('aria-label'),'Персонаж Алиса: варианты и одежда');
    assert.deepEqual(editor.read(),before);
  }finally{editor.destroy();setActiveLocalization(null);dom.window.close();}
});
