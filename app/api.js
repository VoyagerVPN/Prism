import { COMFY_URL, randomUuid } from './config.js';
import { buildModelCatalog, comboValues as extractList } from './model_loader.js';

export { COMFY_URL } from './config.js';
export let objectInfo = {};
export let modelList = [];
export let modelCatalog = [];
export let loraList = ['None'];
export let loraDetailsMap = {};
export let upscaleModelList = [];
export let samplerList = [];
export let schedulerList = [];
export let vaeList = ['None'];

async function requestJson(baseUrl, path, options = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30000), ...options });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const details = Object.entries(data.node_errors ?? {}).map(([id, value]) =>
      `${id} (${value.class_type ?? 'Node'}): ${(value.errors ?? []).map(error => error.message).join(', ')}`
    ).join('\n');
    const error = new Error([data.error?.message ?? data.error ?? `HTTP ${response.status}`, details].filter(Boolean).join('\n'));
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function fetchComfyInfo() {
  objectInfo = await requestJson(COMFY_URL, '/object_info');
  modelCatalog = buildModelCatalog(objectInfo);
  modelList = modelCatalog.filter(model => !model.reason).map(model => model.name);
  loraList = ['None', ...extractList(objectInfo.LoraLoader?.input.required.lora_name)];
  upscaleModelList = extractList(objectInfo.UpscaleModelLoader?.input.required.model_name);
  samplerList = extractList(objectInfo.KSampler?.input.required.sampler_name);
  schedulerList = extractList(objectInfo.KSampler?.input.required.scheduler);
  vaeList = ['None', ...extractList(objectInfo.VAELoader?.input.required.vae_name)];
}

export async function refreshComfyModels() {
  return requestJson(COMFY_URL, '/dashboard/refresh', { method: 'POST' });
}

export async function fetchLoraTriggers() {
  loraDetailsMap = await requestJson(COMFY_URL, '/dashboard/lora_triggers');
}

export async function getSystemStats() {
  return requestJson(COMFY_URL, '/system_stats');
}

export async function uploadInputImage(file) {
  const formData = new FormData();
  // Уникальное имя не позволяет следующей загрузке изменить вход уже стоящего в очереди задания.
  formData.append('image', file, `${randomUuid()}-${file.name}`);
  const result = await requestJson(COMFY_URL, '/upload/image', { method: 'POST', body: formData });
  return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
}

export function imageUrl(image) {
  return `${COMFY_URL}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' })}`;
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled', 'lost']);

export class ComfyClient extends EventTarget {
  constructor({ baseUrl = COMFY_URL, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, storage = globalThis.sessionStorage, pollMs = 3000 } = {}) {
    super();
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
    this.storage = storage;
    this.pollMs = pollMs;
    this.connected = false;
    this.closed = false;
    this.job = null;
    this.clientId = randomUuid();
    try {
      const saved = JSON.parse(storage?.getItem('matrix-active-job') ?? 'null');
      if (saved?.promptId && saved?.workflow && saved?.settings && typeof saved.status === 'string') this.job = saved;
      this.clientId = storage?.getItem('matrix-client-id') ?? this.clientId;
      storage?.setItem('matrix-client-id', this.clientId);
    } catch (error) { this.storageError = error.message; }
  }

  get busy() { return this.job !== null && !terminalStates.has(this.job.status); }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  publish() {
    try { this.storage?.setItem('matrix-active-job', JSON.stringify(this.job)); }
    catch (error) { this.emit('warning', `Не удалось сохранить задание в браузере: ${error.message}`); }
    this.emit('job', structuredClone(this.job));
  }

  request(path, options) { return requestJson(this.baseUrl, path, options, this.fetchImpl); }

  async submit(workflow, settings) {
    if (this.busy) throw new Error('Дождитесь завершения текущего задания или отмените его.');
    this.job = { promptId: randomUuid(), workflow: structuredClone(workflow), settings: structuredClone(settings), status: 'submitting', submittedAt: Date.now(), outputs: [] };
    this.submitting = true;
    this.publish();
    try {
      const result = await this.request('/prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: this.job.workflow, prompt_id: this.job.promptId, client_id: this.clientId, extra_data: { extra_pnginfo: { matrix: { version: 1, settings: this.job.settings } } } })
      });
      if (result.prompt_id !== this.job.promptId) throw new Error('Сервер вернул другой идентификатор задания.');
      if (this.job.status === 'submitting') this.job.status = 'queued';
      this.publish();
    } catch (error) {
      // После сетевой ошибки запрос мог попасть в очередь: повторно POST не отправляем.
      this.job.status = error.status && error.status < 500 ? 'failed' : 'unknown';
      this.job.error = error.message;
      this.publish();
      throw error;
    } finally { this.submitting = false; }
    return structuredClone(this.job);
  }

  connect() {
    this.closed = false;
    if (this.socket && this.socket.readyState < 2) return;
    const url = new URL('/ws', this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('clientId', this.clientId);
    this.socket = new this.WebSocketImpl(url.toString());
    this.socket.binaryType = 'blob';
    this.socket.addEventListener('open', () => {
      this.connected = true;
      this.emit('connection', true);
      if (this.busy) this.reconcile().catch(error => this.emit('warning', error.message));
    });
    this.socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') {
        if (this.busy) this.emit('preview', event.data);
        return;
      }
      try { this.handleMessage(JSON.parse(event.data)); }
      catch (error) { this.emit('warning', `Ошибка сообщения ComfyUI: ${error.message}`); }
    });
    this.socket.addEventListener('error', () => this.emit('warning', 'Соединение с ComfyUI прервано.'));
    this.socket.addEventListener('close', () => {
      this.connected = false;
      this.emit('connection', false);
      if (this.closed) return;
      if (this.busy) { this.job.status = 'reconnecting'; this.publish(); }
      this.retryTimer = setTimeout(() => this.connect(), 3000);
    });
    if (this.pollMs && !this.pollTimer) {
      this.pollTimer = setInterval(() => {
        if (this.busy) this.reconcile().catch(error => this.emit('warning', error.message));
      }, this.pollMs);
    }
  }

  handleMessage({ type, data }) {
    if (type === 'status') { this.emit('queue', data.status?.exec_info?.queue_remaining ?? 0); return; }
    if (!this.busy || data?.prompt_id !== this.job.promptId) return;
    if (type === 'execution_error' || type === 'execution_interrupted') {
      this.job.status = type === 'execution_interrupted' ? 'cancelled' : 'failed';
      this.job.error = data.exception_message ?? null;
      this.publish();
    } else if (type === 'execution_success' || (type === 'executing' && data.node === null)) {
      this.reconcile().catch(error => this.emit('warning', error.message));
    } else if (['execution_start', 'executing', 'progress'].includes(type)) {
      if (!this.job.cancelRequested) this.job.status = 'running';
      this.publish();
      this.emit('progress', { ...data, classType: this.job.workflow[data.node]?.class_type });
    }
  }

  async reconcile() {
    if (!this.busy || this.reconciling) return;
    this.reconciling = true;
    const job = this.job;
    try {
      const history = await this.request(`/history/${job.promptId}`);
      const entry = history[job.promptId];
      if (entry?.status?.completed && entry.status.status_str === 'success') {
        job.status = 'succeeded';
        job.outputs = Object.entries(job.workflow).flatMap(([id,node]) =>
          node.class_type === 'SaveImage' ? entry.outputs?.[id]?.images ?? [] : []);
        job.finishedAt = Date.now();
        job.error = null;
        if (job.settings.batchLayout === 'square-v1' && job.outputs.length !== job.settings.batchCount) {
          job.status = 'failed';
          job.error = `Серия вернула ${job.outputs.length} файлов вместо ${job.settings.batchCount}.`;
        }
      } else if (entry?.status?.status_str === 'error') {
        const messages = entry.status.messages ?? [];
        job.status = messages.some(([type]) => type === 'execution_interrupted') ? 'cancelled' : 'failed';
        job.error = messages.find(([type]) => type === 'execution_error')?.[1]?.exception_message ?? 'ComfyUI не завершил задание.';
      } else {
        const queue = await this.request('/queue');
        const running = (queue.queue_running ?? []).some(item => item[1] === job.promptId);
        const pending = (queue.queue_pending ?? []).some(item => item[1] === job.promptId);
        if (running || pending) {
          job.status = job.cancelRequested ? 'cancelling' : running ? 'running' : 'queued';
          job.error = null;
        } else if (!this.submitting && this.busy) {
          job.status = job.cancelRequested ? 'cancelled' : 'unknown';
          job.error = job.cancelRequested ? null : 'Задание отсутствует в очереди и истории сервера. Автоматический повтор отключён.';
        }
      }
      this.publish();
    } finally { this.reconciling = false; }
  }

  async cancel() {
    if (!this.busy) return;
    const result = await this.request(`/api/jobs/${this.job.promptId}/cancel`, { method: 'POST' });
    if (result.cancelled) { this.job.cancelRequested = true; this.job.status = 'cancelling'; this.publish(); }
    await this.reconcile();
  }

  abandon() {
    if (this.job?.status !== 'unknown') return;
    this.job.status = 'lost';
    this.publish();
  }

  async clearQueue() {
    await this.request('/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) });
    await this.reconcile();
    const queue = await this.request('/queue');
    this.emit('queue', (queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0));
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.socket?.close();
  }
}
