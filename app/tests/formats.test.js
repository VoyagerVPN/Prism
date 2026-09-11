import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('Сводка формата показывает общее число пикселей', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  globalThis.localStorage = dom.window.localStorage;
  try {
    const {initImageFormats} = await import('../formats.js');
    initImageFormats();
    const width = document.getElementById('width-slider');
    const height = document.getElementById('height-slider');
    width.value = '472';
    width.dispatchEvent(new Event('input'));
    height.value = '1176';
    height.dispatchEvent(new Event('input'));

    const summary = document.getElementById('current-format-ratio').textContent.replaceAll(/\s/g, ' ');
    assert.equal(summary, '59:147 · 472 × 1176 px · 555 072 пикс.');
  } finally {
    dom.window.close();
  }
});
