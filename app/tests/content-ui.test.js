import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Панель персонажа показывает смысловой выбор, а LoRA оставляет в техническом раскрытии',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../index.css',import.meta.url),'utf8');
  const controls=await readFile(new URL('../controls.css',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/prism/',pretendToBeVisual:true});
  const keys=['window','document','Event','CustomEvent','Option','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  for(const key of ['Event','CustomEvent','Option','localStorage'])globalThis[key]=dom.window[key];
  globalThis.fetch=async url=>{
    assert.equal(url,'/prism/characters');
    return Response.json({revision:'synthetic-1',characters:{Алиса:{
      name:'Алиса',universe:'Тестовый мир',lora:'Character/alice.safetensors',strength:.8,
      appearances:{Портрет:'зелёные глаза'},activeAppearanceName:'Портрет',
      outfits:{Повседневный:'синяя куртка'},activeOutfitName:'Повседневный',outfitEnabled:true,
    }}});
  };
  try{
    const {initCharacters}=await import(`../characters.js?content-ui=${Date.now()}`);
    await initCharacters();
    const card=document.getElementById('character-card');
    assert.equal(card.querySelector('h3').textContent.trim(),'Персонаж в кадре');
    assert.ok(card.querySelector('label[for="character-select"]'),'У выбора есть видимая подпись');
    assert.doesNotMatch(css,/#character-card\s*\{[^}]*display\s*:\s*none/i);

    document.getElementById('character-select').value='Алиса';
    document.getElementById('character-select').dispatchEvent(new Event('change'));
    const primary=card.cloneNode(true);
    primary.querySelector('.character-technical')?.remove();
    primary.querySelector('#character-details')?.remove();
    assert.doesNotMatch(primary.textContent,/LoRA|safetensors|вес модели/i);
    assert.match(primary.textContent,/Внешность/);
    assert.match(primary.textContent,/одежд/i);
    assert.match(primary.textContent,/Изменить персонажа/);

    const technical=card.querySelector('details.character-technical');
    assert.ok(technical);assert.equal(technical.open,false);
    assert.equal(technical.querySelector('summary').textContent.trim(),'Техническая реализация');
    assert.match(controls,/\.character-technical\s*>\s*summary::after\s*\{[^}]*content:/,'Раскрытие имеет видимый маркер');
    assert.match(controls,/\.character-technical\[open\]\s*>\s*summary::after/,'Маркер отражает открытое состояние');
    assert.ok(technical.querySelector('#char-lora-select'));
    assert.ok(technical.querySelector('#char-lora-strength'));
    assert.equal(card.querySelector('#choose-character-btn').textContent.trim(),'Открыть библиотеку персонажей');
  }finally{
    Object.assign(globalThis,originals);dom.window.close();
  }
});
