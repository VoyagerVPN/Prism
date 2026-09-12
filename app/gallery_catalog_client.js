import {COMFY_URL, imageUrl} from './api.js';
import {generationFromHistory, historyFromCatalog, sameImage, selectedOutputImage} from './result_catalog.js';


let activeFetch = globalThis.fetch;
let imageToUrl = imageUrl;
let catalog = {version: 3, items: [], operations: []};


function notify() {
  globalThis.window?.dispatchEvent(new CustomEvent('prism-gallery-catalog-change'));
}


async function request(path, options = {}) {
  const response = await activeFetch(`${COMFY_URL}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}


function normalizeSnapshot(value) {
  return {
    version: value?.version === 3 ? 3 : 3,
    items: Array.isArray(value?.items) ? value.items : [],
    operations: Array.isArray(value?.operations) ? value.operations : [],
  };
}


function mergeRegistration(registration) {
  const items = new Map(catalog.items.map(item => [item.id, item]));
  for (const item of registration?.items ?? []) items.set(item.id, item);
  const operations = new Map(catalog.operations.map(operation => [operation.id, operation]));
  if (registration?.operation) operations.set(registration.operation.id, registration.operation);
  catalog = {
    version: 3,
    items: [...items.values()].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)),
    operations: [...operations.values()].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)),
  };
}


export function configureGalleryCatalog({fetchImpl = globalThis.fetch, imageToUrl: nextImageToUrl = imageUrl} = {}) {
  activeFetch = fetchImpl;
  imageToUrl = nextImageToUrl;
  catalog = {version: 3, items: [], operations: []};
}


export async function loadGalleryCatalog() {
  catalog = normalizeSnapshot(await request('/prism/gallery'));
  notify();
  return galleryCatalogSnapshot();
}


export async function registerGalleryHistory(item) {
  const generation = generationFromHistory(item);
  if (!generation.outputs.length && !generation.gridOutput) return null;
  const registration = await request('/prism/gallery', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(generation),
  });
  mergeRegistration(registration);
  notify();
  return registration;
}


export function galleryCatalogSnapshot() {
  return structuredClone(catalog);
}


export function galleryCatalogItems() {
  return catalog.items;
}


export function galleryCatalogOperations() {
  return catalog.operations;
}


export function galleryCatalogHistory(limit = 15) {
  return historyFromCatalog(catalog, imageToUrl, limit);
}


export function galleryHistorySelection(itemId) {
  const item = catalog.items.find(value => value.id === itemId);
  if (!item) return null;
  const operation = catalog.operations.find(value => value.id === item.operationId)
    ?? catalog.operations.find(value => value.gridArtId === itemId || value.outputArtIds?.includes(itemId));
  if (!operation) return null;
  const historyItem = historyFromCatalog({items: catalog.items, operations: [operation]}, imageToUrl, 1)[0];
  if (!historyItem) return null;
  const frameIndex = operation.outputArtIds?.indexOf(itemId) ?? -1;
  const batchIndex = frameIndex >= 0 && (operation.outputArtIds?.length ?? 0) > 1 ? frameIndex + 1 : 0;
  return {historyItem, batchIndex};
}


export function galleryFavoriteState(historyItem, batchIndex = 0) {
  const image = selectedOutputImage(historyItem, batchIndex);
  const item = image ? catalog.items.find(value => sameImage(value.image, image)) : null;
  return {available: Boolean(item), favorite: Boolean(item?.favorite)};
}

export function galleryMediaSource(historyItem, batchIndex = 0) {
  const image = selectedOutputImage(historyItem, batchIndex);
  const item = image ? catalog.items.find(value => sameImage(value.image, image)) : null;
  return item?{kind:'gallery',id:item.id}:null;
}


export async function setGalleryFavorite(itemId, favorite) {
  const {item: updated} = await request('/prism/gallery/favorite', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: itemId, favorite}),
  });
  const item = catalog.items.find(value => value.id === updated.id);
  if (item) Object.assign(item, updated);
  else catalog.items.push(updated);
  notify();
  return updated;
}


export async function toggleGalleryFavorite(historyItem, batchIndex = 0) {
  const image = selectedOutputImage(historyItem, batchIndex);
  const item = image ? catalog.items.find(value => sameImage(value.image, image)) : null;
  if (!item) throw new Error('Кадр ещё не добавлен в галерею.');
  await setGalleryFavorite(item.id, !item.favorite);
  return galleryFavoriteState(historyItem, batchIndex);
}
