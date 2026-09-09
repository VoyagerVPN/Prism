import { ComfyClient, refreshComfyModels, fetchComfyInfo, fetchLoraTriggers, getSystemStats, uploadI2IImage, imageUrl, objectInfo, modelList, upscaleModelList } from './api.js';
import { setupUIEventListeners, syncModelLists } from './ui.js';
import * as state from './state.js';
import * as el from './elements.js';
import { loadSavedSettings, readSettings, saveSettings, applySettings } from './storage.js';
import { initCharacters } from './characters.js';
import { loadCustomProfiles, initPresetEvents, renderProfiles } from './presets.js';
import { initGalleryEvents, displayOutputImage, selectedHistoryItem, selectHistoryItem } from './gallery.js';
import { compileWorkflow } from './workflow.js';
import { validateCapabilities, comboValues } from './model_loader.js';
import { updateStatus, showProgress, updateProgressBar } from './status.js';
import { setupModelImport } from './import.js';
import { loadLoraLibrary } from './library.js';
import { setupSelectControls } from './controls.js';

const client = new ComfyClient();
let preparing = false;
let ready = false;
let previewUrl;
const message = document.getElementById('dashboard-message');
const resetButton = document.getElementById('reset-job-btn');
const labels = { submitting: 'Отправка', queued: 'В очереди', running: 'Выполняется', reconnecting: 'Восстановление связи', unknown: 'Состояние неизвестно', cancelling: 'Отмена', cancelled: 'Отменено', failed: 'Ошибка', succeeded: 'Готово', lost: 'Задание отсоединено' };
function warn(text) {
  message.textContent = text;
  message.hidden = !text;
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
    showProgress(preparing ? 'Подготовка файла' : labels[client.job.status], preparing ? 'Проверка настроек и исходных файлов' : 'Настройки задания уже зафиксированы');
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
  const inputFile = state.i2iFile;
  const faceFile = state.reactorFile;
  settings.seed = settings.seedMode === 'random' ? Math.floor(Math.random() * 10000000000) : Number(settings.seedInput);
  if (settings.variationStrength > 0) {
    const value = settings.variationSeedInput.trim();
    settings.variationSeed = ['', 'random', '-1'].includes(value) ? Math.floor(Math.random() * 10000000000) : Number(value);
  }
  if (settings.mode === 'i2i' && inputFile) {
    settings.inputImageName = await uploadI2IImage(inputFile);
    const bitmap = await createImageBitmap(inputFile);
    settings.inputWidth = bitmap.width;
    settings.inputHeight = bitmap.height;
    bitmap.close();
    if (state.i2iFile === inputFile) state.setI2IImage(settings.inputImageName, settings.inputWidth, settings.inputHeight);
  }
  if (settings.reactorToggle && faceFile) {
    settings.reactorImageName = await uploadI2IImage(faceFile);
    if (state.reactorFile === faceFile) state.setReactorImageName(settings.reactorImageName);
  }
  saveSettings();
  await submit(settings);
}
async function refine({ item, index }) {
  const output = item.outputs?.[index];
  if (!output) throw new Error('Выберите сохранённый кадр.');
  const scale = Number(el.hiresScaleSelect.value);
  const denoise = Number(el.hiresDenoiseSlider.value);
  const upscaleSelect = el.upscaleSelect.value;
  const response = await fetch(imageUrl(output), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Исходный кадр недоступен: HTTP ${response.status}`);
  const file = new File([await response.blob()], output.filename, { type: 'image/png' });
  const bitmap = await createImageBitmap(file);
  const settings = structuredClone(item.settings);
  // Используем выбранный файл; уже выполненные завершающие этапы повторно не применяем.
  Object.assign(settings, {
    mode: 'i2i', operation: 'refine', batchCount: 1,
    parentPromptId: item.promptId, parentOutput: output,
    inputWidth: bitmap.width, inputHeight: bitmap.height,
    width: Math.round(bitmap.width * scale / 8) * 8,
    height: Math.round(bitmap.height * scale / 8) * 8,
    denoise, upscaleSelect,
    hiresToggle: false, faceToggle: false, reactorToggle: false, upscaleToggle: false,
  });
  bitmap.close();
  settings.inputImageName = await uploadI2IImage(file);
  await submit(settings);
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
    const data = await getSystemStats();
    for (const [total, free, label, fill] of [
      [data.system.ram_total, data.system.ram_free, el.ramVal, el.ramFill],
      [data.devices?.[0]?.vram_total, data.devices?.[0]?.vram_free, el.vramVal, el.vramFill],
    ]) {
      label.textContent = total ? `${((total - free) / 1073741824).toFixed(1)} / ${(total / 1073741824).toFixed(1)} GB` : '—';
      fill.style.width = total ? `${(total - free) / total * 100}%` : '0%';
    }
  } catch { el.ramVal.textContent = el.vramVal.textContent = '—'; }
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
  if (!client.busy && previewUrl) {
    URL.revokeObjectURL(previewUrl); previewUrl = null;
    if (selectedHistoryItem) selectHistoryItem(selectedHistoryItem);
    else { el.outputImage.style.display = 'none'; el.canvasPlaceholder.style.display = 'flex'; }
  }
});
client.addEventListener('progress', event => {
  const progress = event.detail;
  if (progress.max) {
    const frame = /^frame_(\d+)_/.exec(String(progress.node));
    const count = frame ? client.job.settings.batchCount : 1;
    const index = frame ? Number(frame[1]) : 0;
    updateProgressBar(Math.round(progress.value/progress.max*100), `${frame ? `Кадр ${index+1}/${count} · ` : ''}${progress.classType ?? 'Узел'}: ${progress.value}/${progress.max}`);
  }
});
client.addEventListener('preview', async event => {
  const blob = event.detail;
  const header = new DataView(await blob.slice(0, 8).arrayBuffer());
  if (!client.busy || header.byteLength < 8 || header.getUint32(0) !== 1) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob.slice(8, blob.size, header.getUint32(4) === 2 ? 'image/png' : 'image/jpeg'));
  el.outputImage.src = previewUrl;
  el.outputImage.style.display = 'block';
  document.getElementById('batch-grid').style.display = 'none';
  el.canvasPlaceholder.style.display = 'none';
});
window.addEventListener('dashboard-warning', event => warn(event.detail));
window.addEventListener('restore-history-settings', event => { applySettings(event.detail); saveSettings(); });
window.addEventListener('generate-image', () => run(generate));
window.addEventListener('repeat-job', event => run(() => submit(event.detail.settings, event.detail.workflow)));
window.addEventListener('refine-image', event => run(() => refine(event.detail)));
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
  render();
  try {
    await refresh();
    loadSavedSettings();
    await loadCustomProfiles();
    state.updateAllExpansions();
  } catch (error) { warn(error.message); }
  client.connect();
  if (client.job?.status === 'succeeded') displayOutputImage(client.job);
  render();
  stats();
  setInterval(stats, 5000);
});
