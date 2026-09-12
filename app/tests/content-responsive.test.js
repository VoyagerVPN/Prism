import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Карточка персонажа сохраняет desktop-сетку и мобильные touch-targets',async()=>{
  const css=await readFile(new URL('../index.css',import.meta.url),'utf8');
  const controls=await readFile(new URL('../controls.css',import.meta.url),'utf8');
  assert.match(css,/#settings-image:not\(\[hidden\]\)\s*\{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/#settings-image\s*>\s*#character-card\s*\{[^}]*grid-column:3[^}]*grid-row:1/);
  assert.match(css,/@media\s*\(max-width:1100px\)[\s\S]*?\.settings-panel:not\(\[hidden\]\)\s*\{\s*display:block/);
  assert.match(css,/@media\s*\(max-width:\s*1100px\)[\s\S]*?\.char-outfit-controls-row\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(controls,/@media\s*\(max-width:1100px\)[\s\S]*?\.character-technical\s*>\s*summary\s*\{[^}]*min-height:44px/);
  assert.match(controls,/#character-card\s+:is\([^}]*\)\s*\{[^}]*display:none/,'Сырые текстовые поля не занимают место в компактной карточке');
});

test('semantic-токен промпта сохраняет имя и удаление внутри узкого редактора',async()=>{
  const controls=await readFile(new URL('../controls.css',import.meta.url),'utf8');
  const dom=new JSDOM('<div class="inline-prompt"><span class="prompt-content"><span class="prompt-category-icon"></span><span class="prompt-content-name">Очень длинное смысловое название художественного стиля</span><span class="prompt-lora-weight">0.65</span><button class="prompt-content-remove">×</button></span></div>');
  try{
    const style=dom.window.document.createElement('style');style.textContent=controls;dom.window.document.head.append(style);
    const token=dom.window.document.querySelector('.prompt-content'),name=token.querySelector('.prompt-content-name'),remove=token.querySelector('.prompt-content-remove');
    const tokenStyle=dom.window.getComputedStyle(token),nameStyle=dom.window.getComputedStyle(name),removeStyle=dom.window.getComputedStyle(remove);
    assert.equal(tokenStyle.display,'inline-flex');assert.equal(tokenStyle.maxWidth,'calc(100% - 6px)');
    assert.equal(nameStyle.minWidth,'0px');assert.equal(nameStyle.overflow,'hidden');assert.equal(nameStyle.textOverflow,'ellipsis');
    assert.equal(removeStyle.flexShrink,'0');assert.equal(removeStyle.width,'18px');
    assert.match(controls,/@media\(max-width:1100px\)[^\r\n]*\.prompt-content-name\s*\{\s*max-width:145px/);
  }finally{dom.window.close();}
});

test('смысловое действие карточки занимает остаток строки и не выталкивает иконки',async()=>{
  const controls=await readFile(new URL('../controls.css',import.meta.url),'utf8');
  assert.match(
    controls,
    /\.library-card-actions\s*>\s*:is\([^}]*\.library-add[^}]*\)\s*\{[^}]*flex:\s*1\s+1\s+96px[^}]*min-width:\s*0/,
    'Кнопка с названием действия должна сжиматься вместе с карточкой, сохраняя ряд технических иконок',
  );
});
