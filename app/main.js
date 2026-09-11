import { ComfyClient, refreshComfyModels, fetchComfyInfo, fetchLoraTriggers, getPrismMetrics, uploadInputImage, objectInfo, modelList, loraDetailsMap, upscaleModelList } from './api.js';
import { setupUIEventListeners, syncModelLists } from './ui.js';
import * as state from './state.js';
import * as el from './elements.js';
import { loadSavedSettings, readSettings, saveSettings, applySettings } from './storage.js';
import { initCharacters } from './characters.js';
import { loadCustomProfiles, initPresetEvents, renderProfiles } from './presets.js';
import { initGalleryEvents, displayOutputImage } from './gallery.js';
import {setupLivePreview} from './live_preview.js';
import {initArchiveGallery} from './archive_gallery.js';
import { compileWorkflow } from './workflow.js';
import { createRefineSubmission } from './refine.js';
import { assertLoraCompatibility, validateCapabilities, comboValues } from './model_loader.js';
import { updateStatus, showProgress } from './status.js';
import { setupModelImport } from './import.js';
import { loadLoraLibrary } from './library.js';
import { setupSelectControls } from './controls.js';
import { describeProgress } from './progress.js';
import { presentResourceMetrics } from './resource_metrics.js';

const client = new ComfyClient();
let preparing = false;
let ready = false;
const message = document.getElementById('dashboard-message');
const resetButton = document.getElementById('reset-job-btn');
const labels = { submitting: 'Отправка', queued: 'В очереди', running: 'Выполняется', reconnecting: 'Восстановление связи', unknown: 'Состояние неизвестно', cancelling: 'Отмена', cancelled: 'Отменено', failed: 'Ошибка', succeeded: 'Готово', lost: 'Задание отсоединено' };
function warn(text) {
  message.textContent = text;
  message.hidden = !text;
}
function jobProgressView(job) {
  const progress = describeProgress(job.progress, job.workflow, job.settings);
  if (job.status === 'submitting') return { label: 'Отправка', detail: 'Передача зафиксированного workflow в ComfyUI', percent: progress.percent };
  if (job.status === 'queued') return { label: 'В очереди', detail: `Ожидание запуска · Общий прогресс ${Math.round(progress.percent)}%`, percent: progress.percent };
  if (job.status === 'reconnecting') return { label: `Восстановление связи · ${Math.round(progress.percent)}%`, detail: `Последний этап: ${progress.label}`, percent: progress.percent };
  if (job.status === 'cancelling') return { label: 'Отмена задания', detail: `Зафиксированный прогресс ${Math.round(progress.percent)}%`, percent: progress.percent };
  if (job.status === 'unknown') return { label: 'Проверка состояния задания', detail: `Последний прогресс ${Math.round(progress.percent)}%`, percent: progress.percent };
  return progress;
}
function render() {
  const busy = preparing || client.busy;
  el.generateBtn.disabled = busy || !ready;
  el.interruptBtn.disabled = !client.busy || client.job?.status === 'submitting';
  document.querySelector('.header-art-actions').inert = busy;
  document.querySelector('.image-overlay-controls').inert = busy;
  el.outputImage.style.pointerEvents = busy ? 'none' : '';
  resetButton.hidden = client.job?.status !== 'unknown';
  el.imageLoader.style.display = busy ? 'flex' : 'none';
  if (busy) {
    updateStatus('working', preparing ? 'Подготовка файла' : labels[client.job.status]);
    if (preparing) showProgress('Подготовка файла', 'Проверка настроек и исходных файлов', 0);
    else {
      const progress = jobProgressView(client.job);
      showProgress(progress.label, progress.detail, progress.percent);
    }
  } else updateStatus(client.connected ? 'connected' : 'disconnected', client.connected ? 'Подключено' : 'Нет соединения');
}
async function run(action) {
  if (preparing || client.busy) return;
  preparing = true;
  warn('');
  render();
  try { await action(); }
  catch (error) { warn(error.message); }
  finally { preparing = false; render(); }
}
async function submit(settings, workflow = compileWorkflow(settings)) {
  validateCapabilities(workflow, objectInfo);
  await client.submit(workflow, settings);
}
async function generate() {
  const settings = readSettings();
  assertLoraCompatibility(settings.recipe, settings.loras, loraDetailsMap);
  const faceFile = state.reactorFile;
  settings.seed = settings.seedMode === 'random' ? Math.floor(Math.random() * 10000000000) : Number(settings.seedInput);
  if (settings.variationStrength > 0) {
    const value = settings.variationSeedInput.trim();
    settings.variationSeed = ['', 'random', '-1'].includes(value) ? Math.floor(Math.random() * 10000000000) : Number(value);
  }
  if (settings.reactorToggle && faceFile) {
    settings.reactorImageName = await uploadInputImage(faceFile);
    if (state.reactorFile === faceFile) state.setReactorImageName(settings.reactorImageName);
  }
  saveSettings();
  await submit(settings);
}

async function refine({settings, source}) {
  const submission = createRefineSubmission({settings, source});
  assertLoraCompatibility(submission.settings.recipe, submission.settings.loras, loraDetailsMap);
  await submit(submission.settings, submission.workflow);
}
function availability() {
  const detector = comboValues(objectInfo.UltralyticsDetectorProvider?.input.required.model_name);
  const swaps = comboValues(objectInfo.ReActorFaceSwap?.input.required.swap_model);
  for (const [toggle, available, reason] of [
    [el.faceToggle, objectInfo.FaceDetailer && detector.includes('bbox/face_yolov8m.pt'), 'Нужны FaceDetailer и bbox/face_yolov8m.pt'],
    [el.reactorToggle, objectInfo.ReActorFaceSwap && swaps.includes('inswapper_128.onnx'), 'Нужны ReActorFaceSwap и inswapper_128.onnx'],
    [el.hiresToggle, upscaleModelList.length && objectInfo.ImageUpscaleWithModel, 'Нужны узел и веса увеличения'],
    [el.upscaleToggle, upscaleModelList.length && objectInfo.ImageUpscaleWithModel, 'Нужны узел и веса увеличения'],
  ]) {
    toggle.disabled = !available;
    toggle.title = available ? '' : reason;
    toggle.closest('.improvement-card')?.setAttribute('title', available ? '' : reason);
  }
  for (const [select, field] of [[el.reactorDetection, 'facedetection'], [el.reactorRestore, 'face_restore_model']]) {
    const value = select.value;
    select.replaceChildren(...comboValues(objectInfo.ReActorFaceSwap?.input.required[field]).map(name => new Option(name, name)));
    if (value && ![...select.options].some(option => option.value === value)) {
      const missing = new Option(`Недоступно: ${value}`, value); missing.disabled = true; select.add(missing);
    }
    if (value) select.value = value;
  }
  ready = modelList.length > 0;
  if (!ready) warn('ComfyUI не обнаружил checkpoint-моделей. Проверьте пути и обновите список.');
}
async function refresh() {
  await refreshComfyModels();
  await fetchComfyInfo();
  await fetchLoraTriggers();
  syncModelLists();
  await loadLoraLibrary();
  renderProfiles();
  availability();
  render();
}
async function stats() {
  try {
    const view = presentResourceMetrics(await getPrismMetrics());
    el.ramVal.textContent = view.ram.value;
    el.ramDetail.textContent = view.ram.detail;
    el.ramFill.style.width = `${view.ram.percent}%`;
    el.ramVal.closest('.resource-indicator').title = view.ram.title;
    el.vramVal.textContent = view.vram.value;
    el.vramDetail.textContent = view.vram.detail;
    el.vramFill.style.width = `${view.vram.modelPercent}%`;
    el.vramWorkingFill.style.width = `${view.vram.workingPercent}%`;
    el.vramCacheFill.style.width = `${view.vram.cachePercent}%`;
    el.vramVal.closest('.resource-indicator').title = view.vram.title;
  } catch {
    const view = presentResourceMetrics(null);
    el.ramVal.textContent = el.vramVal.textContent = '—';
    el.ramDetail.textContent = view.ram.detail;
    el.vramDetail.textContent = view.vram.detail;
    for (const fill of [el.ramFill, el.vramFill, el.vramWorkingFill, el.vramCacheFill]) fill.style.width = '0%';
  }
}
client.addEventListener('connection', event => {
  if (event.detail && message.textContent === 'Соединение с ComfyUI прервано.') warn('');
  render();
});
client.addEventListener('warning', event => warn(event.detail));
client.addEventListener('queue', event => {
  el.queueLengthText.textContent = `Заданий: ${event.detail}`;
  el.clearQueueBtn.disabled = event.detail < 1;
});
client.addEventListener('job', event => {
  const job = event.detail;
  render();
  if (job.error) warn(job.error);
  if (job.status === 'succeeded') displayOutputImage(job);
});
window.addEventListener('dashboard-warning', event => warn(event.detail));
window.addEventListener('restore-history-settings', event => { applySettings(event.detail); saveSettings(); });
window.addEventListener('generate-image', () => run(generate));
window.addEventListener('refine-image', event => run(() => refine(event.detail)));
window.addEventListener('repeat-job', event => run(() => submit(event.detail.settings, event.detail.workflow)));
window.addEventListener('cancel-job', () => client.cancel().catch(error => warn(error.message)));
window.addEventListener('clear-queue', () => client.clearQueue().catch(error => warn(error.message)));
resetButton.addEventListener('click', () => { client.abandon(); warn('Связь с неизвестным заданием снята. Оно не отправлялось повторно.'); });
document.getElementById('refresh-models-btn').addEventListener('click', async event => {
  const button = event.currentTarget, status = document.getElementById('model-scan-status');
  button.disabled = true;
  const before = new Set(modelList);
  status.textContent = 'Поиск файлов моделей на диске…';
  try {
    await refresh();
    const added = modelList.filter(name => !before.has(name)).length;
    status.textContent = `Список обновлён: моделей ${modelList.length}, новых ${added}.`;
  } catch (error) { status.textContent = `Не удалось обновить список: ${error.message}`; }
  finally { button.disabled = false; }
});
window.addEventListener('load', async () => {
  setupUIEventListeners();
  initPresetEvents();
  setupModelImport(refresh);
  await initCharacters();
  setupSelectControls();
  initGalleryEvents();
  setupLivePreview(client);
  render();
  try {
    await refresh();
    loadSavedSettings();
    await Promise.all([loadCustomProfiles(), initArchiveGallery()]);
    state.updateAllExpansions();
  } catch (error) { warn(error.message); }
  client.connect();
  if (client.job?.status === 'succeeded') displayOutputImage(client.job);
  render();
  stats();
  setInterval(stats, 5000);
});
