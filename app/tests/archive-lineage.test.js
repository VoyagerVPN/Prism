import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('архив показывает происхождение Refine и даёт продолжить с точного арта', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  for (const key of ['window', 'document', 'CustomEvent', 'Event', 'Option', 'localStorage']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  }
  const refined = {id: 'refined', operationId: 'refine-op', kind: 'art', image: {filename: 'refined.png', subfolder: 'Prism', type: 'output'}, characters: [], favorite: false, createdAt: 2, settings: {operation: 'refine'}};
  const operation = {id: 'refine-op', kind: 'refine', status: 'succeeded', promptId: 'job-2', createdAt: 2, sourceArtIds: ['source'], outputArtIds: ['refined'], gridArtId: null, characters: [{name: 'Алиса', lora: 'Character/alice.safetensors'}], settings: {operation: 'refine', positive: 'blue eyes'}, workflow: {load: {class_type: 'LoadImageOutput'}}};
  try {
    const {initArchiveGallery} = await import('../archive_gallery.js');
    await initArchiveGallery({fetchImpl: async () => Response.json({version: 3, items: [refined], operations: [operation]}), migrate: false});
    const card = document.querySelector('[data-gallery-id="refined"]');
    assert.equal(card.dataset.operationId, 'refine-op');
    assert.match(card.querySelector('.archive-origin').textContent, /Refine.*исходника/);
    assert.equal(card.querySelector('.archive-caption').textContent, 'Алиса');
    assert.equal(document.querySelector('[data-booru-kind="tag"][data-booru-label="blue eyes"] .archive-tag-count').textContent, '1');
    let continued = null;
    window.addEventListener('prism-open-catalog-art', event => { continued = event.detail.itemId; });
    card.querySelector('.archive-continue').click();
    assert.equal(continued, 'refined');
    assert.equal(document.body.dataset.appView, 'generation');
  } finally {
    dom.window.close();
  }
});
