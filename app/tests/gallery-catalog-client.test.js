import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureGalleryCatalog,
  galleryCatalogHistory,
  galleryCatalogItems,
  galleryFavoriteState,
  galleryHistorySelection,
  loadGalleryCatalog,
  registerGalleryHistory,
  toggleGalleryFavorite,
} from '../gallery_catalog_client.js';


test('единый клиент загружает историю, регистрирует Refine и синхронизирует избранное', async () => {
  const image = filename => ({filename, subfolder: 'Prism', type: 'output'});
  const sourceItem = {id: 'source', kind: 'art', image: image('source.png'), favorite: false, createdAt: 1};
  const sourceOperation = {
    id: 'generate', kind: 'txt2img', status: 'succeeded', promptId: 'job-1', createdAt: 1,
    sourceArtIds: [], outputArtIds: ['source'], gridArtId: null,
    settings: {positive: 'portrait', seed: 7}, workflow: {save: {class_type: 'SaveImage'}},
  };
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({url: String(url), options});
    if (options.method === 'POST') {
      return Response.json({
        items: [{id: 'refined', kind: 'art', image: image('refined.png'), favorite: false, createdAt: 2, operationId: 'refine'}],
        operation: {
          id: 'refine', kind: 'refine', status: 'succeeded', promptId: 'job-2', createdAt: 2,
          sourceArtIds: ['source'], outputArtIds: ['refined'], gridArtId: null,
          settings: {operation: 'refine', sourceImage: sourceItem.image},
          workflow: {load: {class_type: 'LoadImageOutput'}},
        },
      });
    }
    if (options.method === 'PATCH') {
      return Response.json({item: {...sourceItem, favorite: true}});
    }
    return Response.json({version: 3, items: [sourceItem], operations: [sourceOperation]});
  };

  configureGalleryCatalog({fetchImpl, imageToUrl: value => `/view/${value.filename}`});
  await loadGalleryCatalog();
  assert.equal(galleryCatalogHistory()[0].workflow.save.class_type, 'SaveImage');
  assert.equal(galleryHistorySelection('source').historyItem.operationId, 'generate');
  assert.equal(galleryHistorySelection('source').batchIndex, 0);

  await registerGalleryHistory({
    promptId: 'job-2', timestamp: 2, operation: 'refine', sourceArtIds: ['source'],
    settings: {operation: 'refine', sourceImage: sourceItem.image},
    workflow: {load: {class_type: 'LoadImageOutput'}},
    outputs: [image('refined.png')], url: '/view/refined.png',
  });
  assert.equal(galleryCatalogHistory()[0].operation, 'refine');
  assert.equal(galleryHistorySelection('refined').historyItem.operation, 'refine');
  const posted = JSON.parse(requests.find(request => request.options.method === 'POST').options.body);
  assert.deepEqual(posted.sourceArtIds, ['source']);
  assert.equal(posted.workflow.load.class_type, 'LoadImageOutput');

  const sourceHistory = galleryCatalogHistory().find(item => item.operationId === 'generate');
  assert.deepEqual(galleryFavoriteState(sourceHistory), {available: true, favorite: false});
  await toggleGalleryFavorite(sourceHistory);
  assert.equal(galleryCatalogItems().find(item => item.id === 'source').favorite, true);
});
