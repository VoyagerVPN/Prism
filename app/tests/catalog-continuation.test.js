import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('продолжение из архива выбирает точный кадр серверной серии', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  for (const key of ['window', 'document', 'CustomEvent', 'Event', 'Option', 'localStorage']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  }
  const image = filename => ({filename, subfolder: 'Prism', type: 'output'});
  const snapshot = {
    version: 3,
    items: [
      {id: 'a', operationId: 'series', kind: 'art', image: image('a.png'), frameIndex: 0},
      {id: 'b', operationId: 'series', kind: 'art', image: image('b.png'), frameIndex: 1},
      {id: 'old', operationId: 'old-operation', kind: 'art', image: image('old.png'), frameIndex: 0},
    ],
    operations: [
      {
        id: 'series', kind: 'txt2img', status: 'succeeded', promptId: 'job', createdAt: 1,
        sourceArtIds: [], outputArtIds: ['a', 'b'], gridArtId: null,
        settings: {positive: 'portrait', seed: 7, batchCount: 2, batchLayout: 'square-v1'},
        workflow: {save: {class_type: 'SaveImage'}},
      },
      {
        id: 'old-operation', kind: 'txt2img', status: 'succeeded', promptId: 'old-job', createdAt: 0,
        sourceArtIds: [], outputArtIds: ['old'], gridArtId: null,
        settings: {positive: 'legacy portrait', seed: 3}, workflow: null,
      },
    ],
  };
  try {
    const client = await import('../gallery_catalog_client.js');
    client.configureGalleryCatalog({fetchImpl: async () => Response.json(snapshot), imageToUrl: value => `/view?filename=${value.filename}&subfolder=Prism&type=output`});
    await client.loadGalleryCatalog();
    const gallery = await import('../gallery.js');
    gallery.updateHistory([]);
    gallery.initGalleryEvents();

    window.dispatchEvent(new CustomEvent('prism-open-catalog-art', {detail: {itemId: 'b'}}));

    assert.equal(gallery.selectedHistoryItem.operationId, 'series');
    assert.equal(gallery.selectedBatchIndex, 2);
    assert.match(document.getElementById('output-image').src, /filename=b\.png/);
    assert.equal(gallery.history.length, 1);

    window.dispatchEvent(new CustomEvent('prism-open-catalog-art', {detail: {itemId: 'old'}}));
    assert.equal(document.getElementById('repeat-btn').disabled, true);
    assert.equal(document.getElementById('repeat-btn').title, 'У старой записи не сохранён точный граф');
  } finally {
    dom.window.close();
  }
});
