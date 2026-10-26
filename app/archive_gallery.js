import {imageUrl} from './api.js';
import {
  configureGalleryCatalog,
  galleryCatalogHistory,
  galleryCatalogItems,
  galleryCatalogOperations,
  loadGalleryCatalog,
  registerGalleryHistory,
  setGalleryFavorite,
} from './gallery_catalog_client.js';
import {generationFromHistory, selectedOutputImage} from './result_catalog.js';

export {galleryFavoriteState, toggleGalleryFavorite} from './gallery_catalog_client.js';
export {generationFromHistory, selectedOutputImage} from './result_catalog.js';

let archiveItems = [];
let archiveOperations = [];
let operationsById = new Map();
let activeFilter = 'all';
const activeBooruTags = new Map();
const PREVIEW_SIZE_KEY = 'prism.galleryPreviewSize.v1';

export function setAppView(view) {
  document.body.dataset.appView = view;
  document.getElementById('generation-view').hidden = view !== 'generation';
  document.getElementById('gallery-view').hidden = view !== 'gallery';
  const editor=document.getElementById('editor-view');
  if(editor)editor.hidden=view!=='editor';
  for (const button of document.querySelectorAll('#app-nav [data-app-view]')) {
    const active = button.dataset.appView === view;
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-pressed', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  window.dispatchEvent(new window.CustomEvent('prism-view-change',{detail:view}));
}

const boundNavButtons = new WeakSet();

export function initAppNavigation() {
  const viewButtons = [...document.querySelectorAll('#app-nav [data-app-view]')];
  for (const button of viewButtons) {
    if(boundNavButtons.has(button))continue;
    boundNavButtons.add(button);
    button.addEventListener('click', () => setAppView(button.dataset.appView));
    button.addEventListener('keydown', event => {
      const current = viewButtons.indexOf(button);
      let next = null;
      if (event.key === 'ArrowLeft') next = viewButtons[(current - 1 + viewButtons.length) % viewButtons.length];
      if (event.key === 'ArrowRight') next = viewButtons[(current + 1) % viewButtons.length];
      if (event.key === 'Home') next = viewButtons[0];
      if (event.key === 'End') next = viewButtons.at(-1);
      if (!next) return;
      event.preventDefault();
      setAppView(next.dataset.appView);
      next.focus();
    });
  }
}

function normalizeTag(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function booruKey(kind, label) {
  return `${kind}\0${normalizeTag(label).toLocaleLowerCase()}`;
}

function operationForItem(item) {
  return operationsById.get(item.operationId);
}

function settingsForItem(item) {
  return operationForItem(item)?.settings ?? item.settings ?? {};
}

function charactersForItem(item) {
  return operationForItem(item)?.characters ?? item.characters ?? [];
}

function promptTags(item) {
  const seen = new Set(), result = [];
  for (const part of String(settingsForItem(item).positive ?? '').split(',')) {
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
  const characters = charactersForItem(item).map(character => normalizeTag(character.name)).filter(Boolean);
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
    const characters = [...new Set(charactersForItem(item).map(character => normalizeTag(character.name)).filter(Boolean))];
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

function syncEmptyState(items = visibleItems()) {
  const empty = document.getElementById('archive-empty');
  empty.hidden = items.length > 0;
  empty.textContent = archiveItems.length ? 'По выбранному фильтру артов нет.' : 'После первой генерации здесь появятся арты Prism.';
}

function cardFor(item) {
  const article = document.createElement('article'); article.className = 'archive-card'; article.dataset.galleryId = item.id;
  const kind = item.kind === 'grid' ? 'grid' : 'art'; article.dataset.galleryKind = kind;
  const operation = operationForItem(item);
  const characters = charactersForItem(item);
  if (operation) article.dataset.operationId = operation.id;
  if (item.parentId) article.dataset.parentId = item.parentId;
  const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'archive-image'; imageButton.setAttribute('aria-label', kind === 'grid' ? 'Открыть сетку' : 'Открыть арт');
  const image = document.createElement('img'); image.src = imageUrl(item.image); image.alt = kind === 'grid' ? `Сетка из ${item.childIds?.length ?? 0} кадров` : characters.length ? `Арт: ${characters.map(value => value.name).join(', ')}` : 'Арт без указанного персонажа'; image.loading = 'lazy';
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
  const description = document.createElement('span'); description.className = 'archive-description';
  const caption = document.createElement('span'); caption.className = 'archive-caption'; caption.textContent = kind === 'grid' ? `Сетка из ${item.childIds?.length ?? 0} кадров` : characters.map(value => value.name).join(' + ') || 'Без персонажа';
  const origin = document.createElement('span'); origin.className = 'archive-origin';
  const operationLabel=operation?.kind==='refine'?'Refine':operation?.kind==='image-edit'?'Редактирование':'Генерация';
  origin.textContent = operation?.sourceArtIds?.length ? `${operationLabel} · из исходника` : '';
  origin.hidden = !origin.textContent;
  description.append(caption, origin);
  const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.className = 'archive-continue';
  continueButton.setAttribute('aria-label', 'Продолжить с этого арта'); continueButton.title = 'Открыть арт в генерации';
  continueButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-sliders"/></svg>';
  continueButton.hidden = kind !== 'art' || !operation;
  continueButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('prism-open-catalog-art', {detail: {itemId: item.id}}));
    setAppView('generation');
  });
  const useAs = document.createElement('button'); useAs.type = 'button'; useAs.className = 'archive-use-as';useAs.setAttribute('aria-label','Использовать изображение как…');useAs.title='Использовать как портрет персонажа или обложку элемента библиотеки';useAs.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#icon-person"/></svg>';
  useAs.addEventListener('click',async()=>{useAs.disabled=true;try{const {openMediaAssignment}=await import('./library.js');await openMediaAssignment({kind:'gallery',id:item.id});}catch(error){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:`Не удалось назначить изображение: ${error.message}`}));}finally{useAs.disabled=false;}});
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'archive-favorite';
  favorite.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-heart"/></svg>';
  favorite.addEventListener('click', async () => {
    favorite.disabled = true;
    try {
      const updated = await setGalleryFavorite(item.id, !item.favorite);
      Object.assign(item, updated);
      syncFavoriteCard(article, item);
      favorite.disabled = false;
      if (activeFilter === 'favorites' && !item.favorite) {
        article.remove();
        syncEmptyState();
      }
    } catch (error) { window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: `Не удалось изменить избранное: ${error.message}`})); favorite.disabled = false; }
  });
  footer.append(description, continueButton, useAs, favorite); article.append(imageButton, footer); syncFavoriteCard(article, item); return article;
}

export function renderArchiveGallery() {
  operationsById = new Map(archiveOperations.map(operation => [operation.id, operation]));
  renderBooruPanel();
  for (const button of document.querySelectorAll('[data-gallery-filter]')) button.setAttribute('aria-pressed', String(button.dataset.galleryFilter === activeFilter));
  const grid = document.getElementById('archive-grid'), items = visibleItems();
  grid.replaceChildren(...items.map(cardFor));
  syncEmptyState(items);
}

async function register(item) {
  const result = await registerGalleryHistory(item);
  if (!result) return;
  archiveItems = galleryCatalogItems();
  archiveOperations = galleryCatalogOperations();
  renderArchiveGallery();
}

export async function initArchiveGallery({fetchImpl = globalThis.fetch, migrate = true, legacyHistory = []} = {}) {
  configureGalleryCatalog({fetchImpl, imageToUrl: imageUrl});
  const compactGallery = Boolean(globalThis.matchMedia?.('(max-width: 1100px)').matches);
  document.querySelector('.archive-booru').open = !compactGallery;
  initAppNavigation();
  for (const button of document.querySelectorAll('[data-gallery-filter]')) button.addEventListener('click', () => { activeFilter = button.dataset.galleryFilter; renderArchiveGallery(); });
  document.getElementById('archive-tag-search').addEventListener('input', renderBooruPanel);
  document.getElementById('archive-tags-clear').addEventListener('click', () => { activeBooruTags.clear(); renderArchiveGallery(); });
  const previewSize = document.getElementById('archive-preview-size');
  previewSize.addEventListener('input', () => setPreviewSize(previewSize.value));
  let savedPreviewSize = 220;
  try { savedPreviewSize = localStorage.getItem(PREVIEW_SIZE_KEY) ?? savedPreviewSize; } catch { /* Используем размер по умолчанию. */ }
  setPreviewSize(savedPreviewSize, {persist: false});
  window.addEventListener('prism-output-created', event => register(event.detail).catch(error => window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: `Арт сохранён на диске, но не добавлен в галерею: ${error.message}`}))));
  await loadGalleryCatalog();
  archiveItems = galleryCatalogItems();
  archiveOperations = galleryCatalogOperations();
  renderArchiveGallery(); setAppView(document.body.dataset.appView || 'generation');
  if (migrate) {
    for (const item of legacyHistory) await register(item);
  }
  return galleryCatalogHistory();
}
