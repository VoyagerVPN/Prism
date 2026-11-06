import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createLocalization} from '../i18n.js';
import {captureStaticTranslations} from '../static_i18n.js';
import {staticMessages} from '../static_messages.js';

test('перевод статических подписей сохраняет значения полей и возвращает русский текст', async () => {
  const dom = new JSDOM('<html><head><title>Prism — генерация изображений</title></head><body><span>Создание</span><button title="Первый запуск">Создание</button><input value="Создание"><select><option>Создание</option></select></body></html>');
  const doc = dom.window.document;
  const apply = captureStaticTranslations(doc);
  const l10n = await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});
  apply(l10n);
  assert.equal(doc.querySelector('span').textContent,'Create');
  assert.equal(doc.querySelector('button').title,'Getting started');
  assert.equal(doc.querySelector('input').value,'Создание');
  assert.equal(doc.querySelector('option').value,'Создание');
  await l10n.changeLanguage('ru');
  apply(l10n);
  assert.equal(doc.querySelector('span').textContent,'Создание');
  assert.equal(doc.querySelector('button').title,'Первый запуск');
  dom.window.close();
});

test('в исходной разметке для каждой русской подписи есть английский перевод', () => {
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  const doc=dom.window.document, missing=new Set(), walker=doc.createTreeWalker(doc.documentElement,4);
  const check=text=>{if(text&&/[А-Яа-яЁё]/u.test(text)&&!Object.hasOwn(staticMessages,text))missing.add(text);};
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(!node.parentElement.closest('script,style,textarea,[contenteditable="true"]'))check(node.data.trim());
  }
  for(const element of doc.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))
    for(const attribute of ['title','aria-label','placeholder','alt'])check(element.getAttribute(attribute));
  assert.deepEqual([...missing],[]);
  dom.window.close();
});

test('смена языка не возвращает устаревший текст состояния', async () => {
  const dom = new JSDOM('<html><body><span>Подключение...</span></body></html>');
  const apply = captureStaticTranslations(dom.window.document);
  const l10n = await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'ru'});
  apply(l10n);
  dom.window.document.querySelector('span').firstChild.data='Подключено';
  await l10n.changeLanguage('en');
  apply(l10n);
  assert.equal(dom.window.document.querySelector('span').textContent,'Подключено');
  dom.window.close();
});
