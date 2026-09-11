import test from 'node:test';
import assert from 'node:assert/strict';
import { ComfyClient } from '../api.js';

test('Клиент работает по HTTP в локальной сети без crypto.randomUUID', () => {
  const original = crypto.randomUUID;
  crypto.randomUUID = undefined;
  try {
    const client = new ComfyClient({ storage: null, pollMs: 0 });
    assert.match(client.clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally { crypto.randomUUID = original; }
});

class Socket extends EventTarget {
  static instances = [];
  constructor() { super(); this.readyState = 1; Socket.instances.push(this); }
  message(type, data) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, data }) })); }
  close() { this.readyState = 3; }
}

test('Серия возвращает четыре кадра и отдельный PNG сетки; отсутствие сетки означает незавершённый результат', async () => {
  let withGrid=true;
  const client = new ComfyClient({storage:null,pollMs:0,fetchImpl:async (url,options) => {
    if (url.endsWith('/prompt')) return Response.json({prompt_id:JSON.parse(options.body).prompt_id});
    const outputs = Object.fromEntries([3,1,2,0].map(index => [`frame_${index}_11`,{images:[{filename:`${index}.png`}]}]));
    if(withGrid)outputs.grid_save={images:[{filename:'grid.png'}]};
    return Response.json({[client.job.promptId]:{status:{completed:true,status_str:'success'},outputs}});
  }});
  const graph=Object.fromEntries([...Array.from({length:4},(_,i)=>`frame_${i}_11`),'grid_save'].map(id=>[id,{class_type:'SaveImage',inputs:{}}]));
  await client.submit(graph,{batchCount:4,batchLayout:'square-v1'});await client.reconcile();
  assert.equal(client.job.status,'succeeded');
  assert.deepEqual(client.job.outputs.map(image=>image.filename),['0.png','1.png','2.png','3.png','grid.png']);
  assert.equal(client.job.gridOutput.filename,'grid.png');
  withGrid=false;
  await client.submit(graph,{batchCount:4,batchLayout:'square-v1'});await client.reconcile();
  assert.equal(client.job.status,'failed');
  assert.match(client.job.error,/5/);
});

test('Порядок кадров определяется графом, а не порядком ответа history', async () => {
  const client = new ComfyClient({storage:null,pollMs:0,fetchImpl:async (url,options) => {
    if (url.endsWith('/prompt')) return Response.json({prompt_id:JSON.parse(options.body).prompt_id});
    const outputs = Object.fromEntries([3,1,2,0].map(index => [`frame_${index}_11`,{images:[{filename:`${index}.png`}]}]));
    return Response.json({[client.job.promptId]:{status:{completed:true,status_str:'success'},outputs}});
  }});
  await client.submit(Object.fromEntries([0,1,2,3].map(index => [`frame_${index}_11`,{class_type:'SaveImage',inputs:{}}])),{batchCount:4,batchLayout:'square-v1'});
  await client.reconcile();
  assert.equal(client.job.status,'succeeded');
  assert.deepEqual(client.job.outputs.map(image => image.filename),['0.png','1.png','2.png','3.png']);
});

test('Задание сохраняет отправленный снимок и принимает результат только из своей history', async () => {
  let history = {};
  let request;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/prompt') {
      request = JSON.parse(options.body);
      return Response.json({ prompt_id: request.prompt_id, number: 0, node_errors: {} });
    }
    if (path.startsWith('/history/')) return Response.json(history);
    return Response.json({ queue_running: [], queue_pending: [[0, request.prompt_id]] });
  };
  const client = new ComfyClient({ baseUrl: 'http://comfy.test', fetchImpl, WebSocketImpl: Socket, storage: null, pollMs: 0 });
  client.connect();
  try {
    const settings = { seed: 0, positive: 'исходный промпт' };
    await client.submit({ save: { class_type: 'SaveImage', inputs: {} } }, settings);
    settings.positive = 'изменённая форма';
    assert.equal(client.job.settings.positive, 'исходный промпт');
    const socket = Socket.instances.at(-1);
    socket.message('execution_error', { prompt_id: 'чужое задание', exception_message: 'ошибка' });
    socket.message('executed', { prompt_id: request.prompt_id, node: 'save', output: { images: [] } });
    assert.equal(client.job.status, 'queued');
    history = { [request.prompt_id]: { status: { completed: true, status_str: 'success' }, outputs: { save: { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } } } };
    await client.reconcile();
    assert.equal(client.job.status, 'succeeded');
    assert.equal(client.job.outputs[0].filename, 'result.png');
    assert.equal(client.job.settings.seed, 0);
  } finally { client.close(); }
});

test('Потерянный ответ POST восстанавливается по history без повторной отправки', async () => {
  let posted = 0;
  const client = new ComfyClient({ storage: null, pollMs: 0, fetchImpl: async (url) => {
    if (url.endsWith('/prompt')) { posted++; throw new TypeError('network lost'); }
    return Response.json({ [client.job.promptId]: { status: { completed: true, status_str: 'success' }, outputs: {} } });
  }});
  await assert.rejects(client.submit({}, { seed: 0 }), /network lost/);
  assert.equal(client.job.status, 'unknown');
  assert.equal(client.busy, true);
  await client.reconcile();
  assert.equal(client.job.status, 'succeeded');
  assert.equal(posted, 1);
});

test('Ошибка отмены не разблокирует задание; успешная отмена адресована только его ID', async () => {
  let rejectCancel = true;
  let cancelledPath;
  const client = new ComfyClient({ storage: null, pollMs: 0, fetchImpl: async (url, options) => {
    if (url.endsWith('/prompt')) return Response.json({ prompt_id: JSON.parse(options.body).prompt_id });
    if (url.endsWith('/cancel')) {
      cancelledPath = new URL(url).pathname;
      return rejectCancel ? Response.json({ error: 'cancel failed' }, { status: 500 }) : Response.json({ cancelled: true });
    }
    return Response.json({});
  }});
  await client.submit({}, { seed: 0 });
  await assert.rejects(client.cancel(), /cancel failed/);
  assert.equal(client.busy, true);
  assert.equal(client.job.cancelRequested, undefined);
  rejectCancel = false;
  await client.cancel();
  assert.equal(cancelledPath, `/api/jobs/${client.job.promptId}/cancel`);
  assert.equal(client.job.status, 'cancelled');
});

test('Перезагрузка восстанавливает ID и снимок; отсутствующее задание требует явного отсоединения', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const fetchImpl = async (url, options) => url.endsWith('/prompt') ? Response.json({ prompt_id: JSON.parse(options.body).prompt_id }) : Response.json({});
  const first = new ComfyClient({ storage, fetchImpl, pollMs: 0 });
  await first.submit({}, { positive: 'original' });
  const restored = new ComfyClient({ storage, fetchImpl, pollMs: 0 });
  assert.equal(restored.clientId, first.clientId);
  assert.equal(restored.job.promptId, first.job.promptId);
  await restored.reconcile();
  assert.equal(restored.job.status, 'unknown');
  await assert.rejects(restored.submit({}, {}), /Дождитесь/);
  restored.abandon();
  assert.equal(restored.busy, false);
});

test('Клиент сохраняет монотонный общий прогресс между сообщениями ComfyUI', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const graph = {
    first: { class_type: 'KSampler', inputs: { steps: 20, denoise: 1 } },
    second: { class_type: 'KSampler', inputs: { latent_image: ['first', 0], steps: 20, denoise: 0.5 } },
    save: { class_type: 'SaveImage', inputs: { images: ['second', 0] } },
  };
  const client = new ComfyClient({ storage, pollMs: 0, fetchImpl: async (url, options) =>
    Response.json({ prompt_id: JSON.parse(options.body).prompt_id }) });
  await client.submit(graph, { batchCount: 1 });
  const prompt_id = client.job.promptId;
  client.handleMessage({ type: 'executing', data: { prompt_id, node: 'first' } });
  client.handleMessage({ type: 'progress', data: { prompt_id, node: 'first', value: 20, max: 20 } });
  const firstPassPercent = client.job.progress.percent;
  client.handleMessage({ type: 'executing', data: { prompt_id, node: 'second' } });
  client.handleMessage({ type: 'progress', data: { prompt_id, node: 'second', value: 1, max: 10 } });

  assert.ok(client.job.progress.percent >= firstPassPercent);
  assert.equal(JSON.parse(values.get('matrix-active-job')).progress.percent, client.job.progress.percent);
});
