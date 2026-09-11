import {COMFY_URL, imageUrl} from './api.js';

let archiveItems = [];
let activeFilter = 'all';
const activeBooruTags = new Map();
let activeFetch = globalThis.fetch;
const PREVIEW_SIZE_KEY = 'prism.galleryPreviewSize.v1';

const sameImage = (left, right) => left && right && left.filename === right.filename && (left.subfolder ?? '') === (right.subfolder ?? '') && (left.type ?? 'output') === (right.type ?? 'output');

function imageFromUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, document?.baseURI ?? 'http://localhost/');
    const filename = url.searchParams.get('filename');
    if (!filename) return null;
    return {filename, subfolder: url.searchParams.get('subfolder') ?? '', type: url.searchParams.get('type') ?? 'output'};
  } catch { return null; }
}

function charactersFromSettings(settings) {
  const result = [], seen = new Set();
  const add = character => {
    if (!character?.name) return;
    const value = {name: String(character.name), lora: String(character.lora ?? '').replaceAll('\\', '/')};
    const key = `${value.name.toLocaleLowerCase()}\0${value.lora.toLocaleLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); result.push(value); }
  };
  for (const part of settings?.positiveParts ?? []) if (part?.type === 'character') add(part.character);
  if (!result.length) add(settings?.character);
  return result;
}

export function generationFromHistory(item) {
  const settings = item?.settings ?? item ?? {};
  const gridOutput = item?.gridOutput ?? imageFromUrl(item?.gridUrl);
  let outputs = Array.isArray(item?.outputs) ? item.outputs.filter(output => !sameImage(output, gridOutput)) : [];
  if (!outputs.length) {
    const urls = item?.batchUrls?.length ? item.batchUrls : [item?.url];
    outputs = urls.map(imageFromUrl).filter(Boolean).filter(output => !sameImage(output, gridOutput));
  }
  return {promptId: item?.promptId ?? '', createdAt: item?.timestamp ?? Date.now(), characters: charactersFromSettings(settings), settings, outputs, gridOutput};
}

async function request(path, options = {}) {
  const response = await activeFetch(`${COMFY_URL}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function setAppView(view) {
  document.body.dataset.appView = view;
  document.getElementById('generation-view').hidden = view !== 'generation';
  document.getElementById('gallery-view').hidden = view !== 'gallery';
  for (const button of document.querySelectorAll('[data-app-view]')) {
    const active = button.dataset.appView === view;
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-pressed', String(active));
  }
}

function normalizeTag(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function booruKey(kind, label) {
  return `${kind}\0${normalizeTag(label).toLocaleLowerCase()}`;
}

function promptTags(item) {
  const seen = new Set(), result = [];
  for (const part of String(item.settings?.positive ?? '').split(',')) {
    const label = normalizeTag(part);
    const key = label.toLocaleLowerCase();
    if (!label || label.length > 80 || /^<lora:/i.test(label) || seen.has(key)) continue;
    seen.add(key); result.push(label);
  }
  return result;
}

function promptTagKind(label) {
  return label.startsWith('@') ? 'artist' : 'tag';
}

function itemBooruKeys(item) {
  const keys = new Set(promptTags(item).map(label => booruKey(promptTagKind(label), label)));
  const characters = item.characters?.map(character => normalizeTag(character.name)).filter(Boolean) ?? [];
  if (characters.length) for (const name of characters) keys.add(booruKey('character', name));
  else keys.add(booruKey('character', '__none__'));
  return keys;
}

function booruFacets() {
  const facets = new Map();
  const add = (kind, label, displayLabel = label) => {
    const key = booruKey(kind, label);
    const current = facets.get(key) ?? {key, kind, label, displayLabel, count: 0};
    current.count += 1; facets.set(key, current);
  };
  for (const item of archiveItems) {
    const characters = [...new Set(item.characters?.map(character => normalizeTag(character.name)).filter(Boolean) ?? [])];
    if (characters.length) for (const name of characters) add('character', name);
    else add('character', '__none__', 'Без персонажа');
    for (const tag of promptTags(item)) add(promptTagKind(tag), tag);
  }
  return [...facets.values()].sort((left, right) => right.count - left.count || left.displayLabel.localeCompare(right.displayLabel, 'ru'));
}

function renderBooruPanel() {
  const query = normalizeTag(document.getElementById('archive-tag-search').value).toLocaleLowerCase();
  const facets = booruFacets();
  const buttonFor = facet => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'archive-tag';
    button.dataset.booruKind = facet.kind; button.dataset.booruLabel = facet.displayLabel;
    button.classList.toggle('active', activeBooruTags.has(facet.key));
    button.setAttribute('aria-pressed', String(activeBooruTags.has(facet.key)));
    const label = document.createElement('span'); label.textContent = facet.displayLabel;
    const count = document.createElement('span'); count.className = 'archive-tag-count'; count.textContent = String(facet.count);
    button.append(label, count);
    button.addEventListener('click', () => {
      if (activeBooruTags.has(facet.key)) activeBooruTags.delete(facet.key);
      else activeBooruTags.set(facet.key, facet);
      renderArchiveGallery();
    });
    return button;
  };
  const shown = facets.filter(facet => !query || facet.displayLabel.toLocaleLowerCase().includes(query));
  document.getElementById('archive-character-tags').replaceChildren(...shown.filter(facet => facet.kind === 'character').map(buttonFor));
  document.getElementById('archive-artist-tags').replaceChildren(...shown.filter(facet => facet.kind === 'artist').map(buttonFor));
  document.getElementById('archive-general-tags').replaceChildren(...shown.filter(facet => facet.kind === 'tag').map(buttonFor));
  const selected = document.getElementById('archive-selected-tags');
  selected.replaceChildren(...[...activeBooruTags.values()].map(facet => {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'archive-selected-tag'; chip.textContent = `${facet.displayLabel} ×`;
    chip.addEventListener('click', () => { activeBooruTags.delete(facet.key); renderArchiveGallery(); });
    return chip;
  }));
  document.getElementById('archive-tags-clear').hidden = activeBooruTags.size === 0;
}

function visibleItems() {
  return archiveItems.filter(item => {
    if (activeFilter === 'favorites' && !item.favorite) return false;
    if (activeFilter === 'art' && (item.kind ?? 'art') !== 'art') return false;
    if (activeFilter === 'grid' && item.kind !== 'grid') return false;
    if (activeBooruTags.size && ![...activeBooruTags.keys()].some(key => itemBooruKeys(item).has(key))) return false;
    return true;
  });
}

function setPreviewSize(value, {persist = true} = {}) {
  const size = Math.max(140, Math.min(420, Number(value) || 220));
  document.getElementById('gallery-view').style.setProperty('--archive-preview-size', `${size}px`);
  document.getElementById('archive-preview-size').value = String(size);
  document.getElementById('archive-preview-size-value').textContent = `${size} px`;
  if (persist) {
    try { localStorage.setItem(PREVIEW_SIZE_KEY, String(size)); } catch { /* Приватный режим не должен ломать галерею. */ }
  }
}

function syncFavoriteButton(button, item) {
  button.classList.toggle('active', Boolean(item.favorite));
  button.setAttribute('aria-pressed', String(Boolean(item.favorite)));
  button.setAttribute('aria-label', item.favorite ? 'Убрать из избранного' : 'Добавить в избранное');
  button.title = button.getAttribute('aria-label');
}

function syncFavoriteCard(card, item) {
  const button = card?.querySelector('.archive-favorite');
  const marker = card?.querySelector('.archive-favorite-marker');
  if (button) syncFavoriteButton(button, item);
  if (marker) marker.hidden = !item.favorite;
}

export function selectedOutputImage(item, batchIndex = 0) {
  if (!item) return null;
  const gridOutput = item.gridOutput ?? imageFromUrl(item.gridUrl);
  const outputs = Array.isArray(item.outputs) ? item.outputs.filter(output => !sameImage(output, gridOutput)) : [];
  const hasBatch = (item.batchUrls?.length ?? outputs.length) > 1;
  if (hasBatch && batchIndex === 0) return gridOutput;
  if (batchIndex > 0) return outputs[batchIndex - 1] ?? imageFromUrl(item.batchUrls?.[batchIndex - 1]);
  return outputs[0] ?? imageFromUrl(item.url);
}

export function galleryFavoriteState(historyItem, batchIndex = 0) {
  const image = selectedOutputImage(historyItem, batchIndex);
  const item = image ? archiveItems.find(value => sameImage(value.image, image)) : null;
  return {available: Boolean(item), favorite: Boolean(item?.favorite)};
}

export async function toggleGalleryFavorite(historyItem, batchIndex = 0) {
  const image = selectedOutputImage(historyItem, batchIndex);
  const item = image ? archiveItems.find(value => sameImage(value.image, image)) : null;
  if (!item) throw new Error('Кадр ещё не добавлен в галерею.');
  const {item: updated} = await request('/prism/gallery/favorite', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: item.id, favorite: !item.favorite})});
  Object.assign(item, updated);
  const card = [...document.querySelectorAll('.archive-card')].find(value => value.dataset.galleryId === item.id);
  syncFavoriteCard(card, item);
  window.dispatchEvent(new CustomEvent('prism-gallery-catalog-change'));
  return galleryFavoriteState(historyItem, batchIndex);
}

function syncEmptyState(items = visibleItems()) {
  const empty = document.getElementById('archive-empty');
  empty.hidden = items.length > 0;
  empty.textContent = archiveItems.length ? 'По выбранному фильтру артов нет.' : 'После первой генерации здесь появятся арты Prism.';
}

function cardFor(item) {
  const article = document.createElement('article'); article.className = 'archive-card'; article.dataset.galleryId = item.id;
  const kind = item.kind === 'grid' ? 'grid' : 'art'; article.dataset.galleryKind = kind;
  if (item.parentId) article.dataset.parentId = item.parentId;
  const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'archive-image'; imageButton.setAttribute('aria-label', kind === 'grid' ? 'Открыть сетку' : 'Открыть арт');
  const image = document.createElement('img'); image.src = imageUrl(item.image); image.alt = kind === 'grid' ? `Сетка из ${item.childIds?.length ?? 0} кадров` : item.characters?.length ? `Арт: ${item.characters.map(value => value.name).join(', ')}` : 'Арт без указанного персонажа'; image.loading = 'lazy';
  const kindLabel = document.createElement('span'); kindLabel.className = 'archive-kind'; kindLabel.textContent = `Сетка · ${item.childIds?.length ?? 0}`; kindLabel.hidden = kind !== 'grid';
  const marker = document.createElement('span'); marker.className = 'archive-favorite-marker'; marker.hidden = !item.favorite; marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = '<svg class="ui-icon"><use href="#icon-heart"/></svg>';
  image.addEventListener('load', () => {
    if (image.naturalWidth && image.naturalHeight) imageButton.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
  });
  imageButton.append(image, kindLabel, marker);
  imageButton.addEventListener('click', async () => {
    const {openLightboxGallery} = await import('./gallery.js');
    openLightboxGallery(visibleItems(), item.id);
  });
  const footer = document.createElement('footer');
  const caption = document.createElement('span'); caption.className = 'archive-caption'; caption.textContent = kind === 'grid' ? `Сетка из ${item.childIds?.length ?? 0} кадров` : item.characters?.map(value => value.name).join(' + ') || 'Без персонажа';
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'archive-favorite';
  favorite.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-heart"/></svg>';
  favorite.addEventListener('click', async () => {
    favorite.disabled = true;
    try {
      const {item: updated} = await request('/prism/gallery/favorite', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: item.id, favorite: !item.favorite})});
      Object.assign(item, updated);
      syncFavoriteCard(article, item);
      window.dispatchEvent(new CustomEvent('prism-gallery-catalog-change'));
      favorite.disabled = false;
      if (activeFilter === 'favorites' && !item.favorite) {
        article.remove();
        syncEmptyState();
      }
    } catch (error) { window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: `Не удалось изменить избранное: ${error.message}`})); favorite.disabled = false; }
  });
  footer.append(caption, favorite); article.append(imageButton, footer); syncFavoriteCard(article, item); return article;
}

export function renderArchiveGallery() {
  renderBooruPanel();
  for (const button of document.querySelectorAll('[data-gallery-filter]')) button.setAttribute('aria-pressed', String(button.dataset.galleryFilter === activeFilter));
  const grid = document.getElementById('archive-grid'), items = visibleItems();
  grid.replaceChildren(...items.map(cardFor));
  syncEmptyState(items);
}

async function register(item) {
  const generation = generationFromHistory(item);
  if (!generation.outputs.length && !generation.gridOutput) return;
  const result = await request('/prism/gallery', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(generation)});
  const byId = new Map(archiveItems.map(value => [value.id, value]));
  for (const value of result.items) byId.set(value.id, value);
  archiveItems = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  renderArchiveGallery();
  window.dispatchEvent(new CustomEvent('prism-gallery-catalog-change'));
}

export async function initArchiveGallery({fetchImpl = globalThis.fetch, migrate = true} = {}) {
  activeFetch = fetchImpl;
  const compactGallery = Boolean(globalThis.matchMedia?.('(max-width: 1100px)').matches);
  document.querySelector('.archive-booru').open = !compactGallery;
  for (const button of document.querySelectorAll('[data-app-view]')) button.addEventListener('click', () => setAppView(button.dataset.appView));
  for (const button of document.querySelectorAll('[data-gallery-filter]')) button.addEventListener('click', () => { activeFilter = button.dataset.galleryFilter; renderArchiveGallery(); });
  document.getElementById('archive-tag-search').addEventListener('input', renderBooruPanel);
  document.getElementById('archive-tags-clear').addEventListener('click', () => { activeBooruTags.clear(); renderArchiveGallery(); });
  const previewSize = document.getElementById('archive-preview-size');
  previewSize.addEventListener('input', () => setPreviewSize(previewSize.value));
  let savedPreviewSize = 220;
  try { savedPreviewSize = localStorage.getItem(PREVIEW_SIZE_KEY) ?? savedPreviewSize; } catch { /* Используем размер по умолчанию. */ }
  setPreviewSize(savedPreviewSize, {persist: false});
  window.addEventListener('prism-output-created', event => register(event.detail).catch(error => window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: `Арт сохранён на диске, но не добавлен в галерею: ${error.message}`}))));
  archiveItems = (await request('/prism/gallery')).items ?? [];
  renderArchiveGallery(); setAppView('generation');
  if (migrate) {
    const {history} = await import('./gallery.js');
    for (const item of history) await register(item);
  }
}
