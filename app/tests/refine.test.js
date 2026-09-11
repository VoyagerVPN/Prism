import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Refine запускается для выбранного кадра и недоступен для сетки', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.Event = dom.window.Event;
  try {
    const gallery = await import('../gallery.js');
    gallery.initGalleryEvents();
    const button = document.getElementById('refine-btn');
    assert.ok(button, 'В панели действий должна быть кнопка Refine');

    const upscale = document.getElementById('upscale-select');
    upscale.append(new dom.window.Option('4x UltraSharp', '4x-UltraSharp.pth'));
    upscale.value = '4x-UltraSharp.pth';
    document.getElementById('hires-scale').value = '2.0';
    document.getElementById('hires-denoise').value = '0.65';
    const output = document.getElementById('output-image');
    Object.defineProperties(output, {
      naturalWidth: {value: 1024, configurable: true},
      naturalHeight: {value: 768, configurable: true},
    });

    const frame = {filename: 'frame.png', subfolder: 'Prism', type: 'output'};
    const settings = {checkpoint: 'original.safetensors', seed: 42, positive: 'portrait', batchCount: 1, width: 512, height: 384};
    const item = {...settings, promptId: 'single', url: '/view?filename=frame.png&subfolder=Prism&type=output', outputs: [frame], settings};
    let detail = null;
    window.addEventListener('refine-image', event => { detail = event.detail; });
    gallery.selectHistoryItem(item);
    output.dispatchEvent(new Event('load'));
    assert.equal(button.disabled, false);
    assert.match(document.getElementById('metadata-summary').textContent, /Размер: 1024x768/);
    assert.doesNotMatch(document.getElementById('metadata-summary').textContent, /Размер: 512x384/);
    button.click();
    assert.equal(detail.settings.checkpoint, 'original.safetensors');
    assert.equal(detail.settings.seed, 42);
    assert.equal(detail.settings.hiresScale, 2);
    assert.equal(detail.settings.hiresDenoise, 0.65);
    assert.equal(detail.settings.upscaleSelect, '4x-UltraSharp.pth');
    assert.deepEqual(detail.source, {...frame, width: 1024, height: 768});

    const grid = {filename: 'grid.png', subfolder: 'Prism', type: 'output'};
    gallery.selectHistoryItem({...item, promptId: 'series', outputs: [frame], gridOutput: grid, gridUrl: '/view?filename=grid.png&subfolder=Prism&type=output', batchUrls: [item.url, '/view?filename=other.png']}, 0);
    assert.equal(button.disabled, true, 'Составную сетку нельзя повторно детализировать как один кадр');
  } finally {
    dom.window.close();
  }
});
