import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Отдельная галерея фильтрует арты по персонажу и избранному', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  for (const key of ['window', 'document', 'CustomEvent', 'Event', 'Option', 'localStorage']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  const items = [
    {id: 'grid', image: {filename: 'grid.png', subfolder: 'Prism', type: 'output'}, kind: 'grid', parentId: null, childIds: ['alice', 'bob'], characters: [], favorite: false, createdAt: 4, settings: {}},
    {id: 'alice', image: {filename: 'alice.png', subfolder: 'Prism', type: 'output'}, characters: [{name: 'Алиса'}], favorite: true, createdAt: 3, settings: {seed: 1, positive: '@mxldx, blue eyes, long hair, blue eyes'}},
    {id: 'bob', image: {filename: 'bob.png', subfolder: 'Prism', type: 'output'}, characters: [{name: 'Боб'}], favorite: false, createdAt: 2, settings: {seed: 2, positive: '@mxldx, blue eyes, short hair'}},
    {id: 'plain', image: {filename: 'plain.png', subfolder: 'Prism', type: 'output'}, characters: [], favorite: false, createdAt: 1, settings: {seed: 3, positive: 'landscape'}},
  ];
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({url: String(url), options});
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      const item = items.find(value => value.id === body.id);
      item.favorite = body.favorite;
      return Response.json({item});
    }
    return Response.json({items});
  };
  try {
    const {initArchiveGallery} = await import('../archive_gallery.js');
    await initArchiveGallery({fetchImpl, migrate: false});
    const generationTab = document.querySelector('#app-nav [data-app-view="generation"]');
    const galleryTab = document.querySelector('#app-nav [data-app-view="gallery"]');
    galleryTab.click();
    assert.equal(document.body.dataset.appView, 'gallery');
    assert.equal(galleryTab.tabIndex, 0);
    assert.equal(generationTab.tabIndex, -1);
    galleryTab.focus();
    galleryTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true, cancelable: true}));
    assert.equal(document.body.dataset.appView, 'generation');
    assert.strictEqual(document.activeElement, generationTab);
    generationTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'End', bubbles: true, cancelable: true}));
    assert.equal(document.body.dataset.appView, 'gallery');
    assert.strictEqual(document.activeElement, galleryTab);
    galleryTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Home', bubbles: true, cancelable: true}));
    assert.strictEqual(document.activeElement, generationTab);
    generationTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    assert.strictEqual(document.activeElement, galleryTab);
    const useAsTitle = 'Использовать как портрет персонажа или обложку элемента библиотеки';
    assert.equal(document.getElementById('output-use-as-btn').title, useAsTitle);
    assert.equal(document.getElementById('lightbox-use-as-btn').title, useAsTitle);
    assert.equal(document.querySelector('[data-gallery-id="alice"] .archive-use-as').title, useAsTitle);
    assert.equal(document.querySelectorAll('.archive-card').length, 4);
    assert.equal(document.querySelector('[data-gallery-id="grid"]').dataset.galleryKind, 'grid');
    assert.match(document.querySelector('[data-gallery-id="grid"] .archive-kind').textContent, /Сетка/);
    document.querySelector('[data-gallery-filter="grid"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['grid']);
    document.querySelector('[data-gallery-filter="art"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['alice', 'bob', 'plain']);
    document.querySelector('[data-gallery-filter="all"]').click();
    assert.equal(document.querySelector('[data-gallery-id="alice"] .archive-favorite-marker').hidden, false);
    assert.equal(document.querySelector('[data-gallery-id="bob"] .archive-favorite-marker').hidden, true);
    assert.equal(document.querySelector('[data-booru-kind="tag"][data-booru-label="blue eyes"] .archive-tag-count').textContent, '2');
    assert.equal(document.querySelector('[data-booru-kind="character"][data-booru-label="Алиса"] .archive-tag-count').textContent, '1');
    assert.equal(document.querySelector('[data-booru-kind="artist"][data-booru-label="@mxldx"] .archive-tag-count').textContent, '2');
    assert.equal(document.querySelector('#archive-general-tags [data-booru-label^="@"]'), null);
    document.querySelector('[data-booru-kind="artist"][data-booru-label="@mxldx"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['alice', 'bob']);
    document.getElementById('archive-tags-clear').click();
    document.querySelector('[data-booru-kind="character"][data-booru-label="Алиса"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['alice']);
    document.querySelector('[data-booru-kind="character"][data-booru-label="Боб"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['alice', 'bob']);
    document.getElementById('archive-tags-clear').click();
    const tagSearch = document.getElementById('archive-tag-search');
    tagSearch.value = 'short'; tagSearch.dispatchEvent(new Event('input'));
    assert.deepEqual([...document.querySelectorAll('#archive-general-tags [data-booru-label]')].map(button => button.dataset.booruLabel), ['short hair']);
    tagSearch.value = ''; tagSearch.dispatchEvent(new Event('input'));
    const portrait = document.querySelector('[data-gallery-id="alice"] img');
    Object.defineProperties(portrait, {naturalWidth: {value: 800}, naturalHeight: {value: 1200}});
    portrait.dispatchEvent(new Event('load'));
    assert.equal(portrait.closest('.archive-image').style.aspectRatio, '800 / 1200');
    const previewSize = document.getElementById('archive-preview-size');
    previewSize.value = '320';
    previewSize.dispatchEvent(new Event('input'));
    assert.equal(document.getElementById('gallery-view').style.getPropertyValue('--archive-preview-size'), '320px');
    assert.equal(document.getElementById('archive-preview-size-value').textContent, '320 px');
    assert.equal(localStorage.getItem('prism.galleryPreviewSize.v1'), '320');

    const aliceCard = document.querySelector('[data-gallery-id="alice"]');
    aliceCard.querySelector('.archive-favorite').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(document.querySelector('[data-gallery-id="alice"]'), aliceCard);
    assert.equal(aliceCard.querySelector('.archive-favorite').classList.contains('active'), false);
    assert.equal(aliceCard.querySelector('.archive-favorite-marker').hidden, true);
    aliceCard.querySelector('.archive-favorite').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(document.querySelector('[data-gallery-id="alice"]'), aliceCard);
    assert.equal(aliceCard.querySelector('.archive-favorite').classList.contains('active'), true);
    assert.equal(aliceCard.querySelector('.archive-favorite-marker').hidden, false);

    document.querySelector('[data-gallery-filter="favorites"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['alice']);
    document.querySelector('.archive-favorite').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.querySelectorAll('.archive-card').length, 0);
    assert.equal(JSON.parse(requests.at(-1).options.body).favorite, false);

    document.querySelector('[data-gallery-filter="all"]').click();
    document.querySelector('[data-booru-kind="character"][data-booru-label="Боб"]').click();
    assert.deepEqual([...document.querySelectorAll('.archive-card')].map(card => card.dataset.galleryId), ['bob']);

    const gallery = await import('../gallery.js');
    gallery.initGalleryEvents();
    document.querySelector('[data-app-view="generation"]').click();
    const bob = items.find(item => item.id === 'bob');
    const bobHistory = {
      promptId: 'bob-history', outputs: [bob.image], batchUrls: [],
      url: 'http://localhost/view?filename=bob.png&subfolder=Prism&type=output', settings: bob.settings,
    };
    gallery.updateHistory([bobHistory]); gallery.renderGallery(); gallery.selectHistoryItem(bobHistory);
    await new Promise(resolve => setImmediate(resolve));
    const outputFavorite = document.getElementById('output-favorite-btn');
    assert.equal(outputFavorite.disabled, false);
    assert.equal(outputFavorite.getAttribute('aria-pressed'), 'false');
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'f', bubbles: true, cancelable: true}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(outputFavorite.getAttribute('aria-pressed'), 'true');
    assert.equal(bob.favorite, true);

    gallery.openLightboxGallery(items, 'bob');
    const lightboxFavorite = document.getElementById('lightbox-favorite-btn');
    assert.equal(document.getElementById('lightbox-caption'), null);
    assert.equal(lightboxFavorite.classList.contains('active'), true);
    document.getElementById('archive-tag-search').dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'f', bubbles: true, cancelable: true}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bob.favorite, true, 'Хоткей не перехватывает ввод текста');
    lightboxFavorite.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bob.favorite, false);
    assert.equal(lightboxFavorite.classList.contains('active'), false);

    gallery.closeLightbox();
    const grid = items.find(item => item.id === 'grid');
    const gridHistory = {
      promptId: 'grid-history', outputs: [grid.image, bob.image, items.find(item => item.id === 'alice').image], gridOutput: grid.image,
      gridUrl: 'http://localhost/view?filename=grid.png&subfolder=Prism&type=output', batchUrls: ['/view?filename=bob.png', '/view?filename=alice.png'], settings: {},
    };
    gallery.updateHistory([gridHistory]); gallery.renderGallery(); gallery.selectHistoryItem(gridHistory, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(outputFavorite.disabled, false, 'Сетка доступна для добавления в избранное');
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'F', bubbles: true, cancelable: true}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(grid.favorite, true, 'Хоткей переключает избранное и для parent-сетки');
  } finally {
    dom.window.close();
  }
});

test('История превращается в карточки отдельных кадров и сохраняет персонажей', async () => {
  const {generationFromHistory} = await import('../archive_gallery.js');
  const grid = {filename: 'grid.png', subfolder: 'Prism', type: 'output'};
  const frames = [1, 2].map(index => ({filename: `frame-${index}.png`, subfolder: 'Prism', type: 'output'}));
  const result = generationFromHistory({
    promptId: 'job', timestamp: 99, outputs: [...frames, grid], gridOutput: grid,
    settings: {positiveParts: [{type: 'character', character: {name: 'Алиса', lora: 'Character/alice.safetensors'}}]},
  });
  assert.deepEqual(result.outputs, frames);
  assert.deepEqual(result.characters, [{name: 'Алиса', lora: 'Character/alice.safetensors'}]);
});

test('карточка открывает самостоятельную последовательность лайтбокса', async () => {
  const source = await readFile(new URL('../archive_gallery.js', import.meta.url), 'utf8');
  assert.match(source, /openLightboxGallery\(visibleItems\(\), item\.id\)/);
  assert.doesNotMatch(source, /selectHistoryItem\(/);
});
