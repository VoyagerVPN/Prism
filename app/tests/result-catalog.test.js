import test from 'node:test';
import assert from 'node:assert/strict';

import {generationFromHistory, historyFromCatalog, selectedOutputImage} from '../result_catalog.js';


test('серверный журнал восстанавливает точную историю серии и Refine после перезагрузки', () => {
  const image = filename => ({filename, subfolder: 'Prism', type: 'output'});
  const snapshot = {
    version: 3,
    items: [
      {id: 'grid', kind: 'grid', image: image('grid.png'), childIds: ['a', 'b']},
      {id: 'a', kind: 'art', image: image('a.png'), parentId: 'grid', frameIndex: 0},
      {id: 'b', kind: 'art', image: image('b.png'), parentId: 'grid', frameIndex: 1},
      {id: 'refined', kind: 'art', image: image('refined.png'), parentId: null, frameIndex: 0},
    ],
    operations: [
      {
        id: 'refine-operation', kind: 'refine', status: 'succeeded', promptId: 'refine-job', createdAt: 20,
        sourceArtIds: ['a'], outputArtIds: ['refined'], gridArtId: null,
        settings: {operation: 'refine', positive: 'portrait', seed: 42, hiresToggle: true},
        workflow: {load: {class_type: 'LoadImageOutput', inputs: {image: 'Prism/a.png [output]'}}},
      },
      {
        id: 'generate-operation', kind: 'txt2img', status: 'succeeded', promptId: 'generate-job', createdAt: 10,
        sourceArtIds: [], outputArtIds: ['a', 'b'], gridArtId: 'grid',
        settings: {operation: 'txt2img', positive: 'portrait', seed: 42, batchCount: 2, batchLayout: 'square-v1'},
        workflow: {save: {class_type: 'SaveImage', inputs: {}}},
      },
    ],
  };
  const toUrl = value => `/view/${value.filename}`;

  const history = historyFromCatalog(snapshot, toUrl);

  assert.equal(history.length, 2);
  assert.equal(history[0].operationId, 'refine-operation');
  assert.equal(history[0].operation, 'refine');
  assert.deepEqual(history[0].sourceArtIds, ['a']);
  assert.equal(history[0].url, '/view/refined.png');
  assert.deepEqual(history[0].workflow, snapshot.operations[0].workflow);
  assert.equal(history[1].url, '/view/grid.png');
  assert.deepEqual(history[1].batchUrls, ['/view/a.png', '/view/b.png']);
  assert.equal(selectedOutputImage(history[1], 2).filename, 'b.png');

  const registration = generationFromHistory(history[0]);
  assert.equal(registration.workflow.load.class_type, 'LoadImageOutput');
  assert.deepEqual(registration.sourceArtIds, ['a']);

  const freshRefine = generationFromHistory({
    settings: {operation: 'refine', sourceImage: image('a.png')},
    outputs: [image('new-refined.png')],
  });
  assert.equal(Object.hasOwn(freshRefine, 'sourceArtIds'), false, 'Сервер должен вывести связь из sourceImage, если клиент ещё не знает ID арта');
});
