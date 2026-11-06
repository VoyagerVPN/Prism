import { ComfyClient, refreshComfyModels, fetchComfyInfo, fetchLoraTriggers, getPrismMetrics, uploadInputImage, objectInfo, modelList, modelCatalog, loraDetailsMap, upscaleModelList } from './api.js';
import { setupUIEventListeners, syncModelLists } from './ui.js';
import * as state from './state.js';
import * as el from './elements.js';
import { loadSavedSettings, readSettings, saveSettings, applySettings } from './storage.js';
import { initCharacters } from './characters.js';
import { loadCustomProfiles, initPresetEvents, renderProfiles } from './presets.js';
import { initGalleryEvents, displayOutputImage, renderGallery, selectHistoryItem, updateHistory } from './gallery.js';
import {setupLivePreview} from './live_preview.js';
import {initAppNavigation,initArchiveGallery,setAppView} from './archive_gallery.js';
import { compileWorkflow } from './workflow.js';
import { createRefineSubmission } from './refine.js';
import { assertLoraCompatibility, validateCapabilities, comboValues } from './model_loader.js';
import { updateStatus, showProgress } from './status.js';
import { setupModelImport } from './import.js';
import { loadLoraLibrary } from './library.js';
import { setupSelectControls } from './controls.js';
import { describeProgress } from './progress.js';
import { presentResourceMetrics } from './resource_metrics.js';
import {setupFirstRun} from './first_run.js';
import {createLocalization, createServerLanguageStore, setActiveLocalization, translate as translateMessage} from './i18n.js';
import {captureStaticTranslations} from './static_i18n.js';
import {syncBatchControls} from './batch.js';

const translateStatic = captureStaticTranslations(document);
let localization = null;
const client = new ComfyClient();
let preparing = false;
let ready = false;
let queueCount = null;
let modelScanStatus = null;
const message = document.getElementById('dashboard-message');
const resetButton = document.getElementById('reset-job-btn');
const labels = { submitting: 'Отправка', queued: 'В очереди', running: 'Выполняется', reconnecting: 'Восстановление связи', unknown: 'Состояние неизвестно', cancelling: 'Отмена', cancelled: 'Отменено', failed: 'Ошибка', succeeded: 'Готово', lost: 'Задание отсоединено' };
const tr=(key,fallback,values={})=>localization?.language==='en'?localization.t(`main.${key}`,{...values,defaultValue:fallback,interpolation:{escapeValue:false}}):fallback;
function warn(text) {
  message.textContent = text;
  message.hidden = !text;
}
function renderModelScanStatus() {
  if (!modelScanStatus) return;
  const status = document.getElementById('model-scan-status');
  if (modelScanStatus.kind === 'scanning') status.textContent = tr('scanning','Поиск файлов моделей на диске…');
  else if (modelScanStatus.kind === 'complete') {
    const {total,added} = modelScanStatus;
    status.textContent = tr('scanComplete',`Список обновлён: моделей ${total}, новых ${added}.`,{total,added});
  } else {
    const {message} = modelScanStatus;
    status.textContent = tr('scanFailed',`Не удалось обновить список: ${message}`,{message});
  }
}
function jobProgressView(job) {
  const progress = describeProgress(job.progress, job.workflow, job.settings, localization);
  const percent=Math.round(progress.percent);
  if (job.status === 'submitting') return { label: tr('job.submitting','Отправка'), detail: tr('submittingDetail','Передача зафиксированного workflow в ComfyUI'), percent: progress.percent };
  if (job.status === 'queued') return { label: tr('job.queued','В очереди'), detail: tr('queuedDetail',`Ожидание запуска · Общий прогресс ${percent}%`,{percent}), percent: progress.percent };
  if (job.status === 'reconnecting') return { label: tr('reconnectingLabel',`Восстановление связи · ${percent}%`,{percent}), detail: tr('lastStage',`Последний этап: ${progress.label}`,{stage:progress.label}), percent: progress.percent };
  if (job.status === 'cancelling') return { label: tr('cancellingLabel','Отмена задания'), detail: tr('recordedProgress',`Зафиксированный прогресс ${percent}%`,{percent}), percent: progress.percent };
  if (job.status === 'unknown') return { label: tr('checkingJob','Проверка состояния задания'), detail: tr('lastProgress',`Последний прогресс ${percent}%`,{percent}), percent: progress.percent };
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
    updateStatus('working', preparing ? tr('preparingFile','Подготовка файла') : tr(`job.${client.job.status}`,labels[client.job.status]));
    if (preparing) showProgress(tr('preparingFile','Подготовка файла'), tr('checkingInputs','Проверка настроек и исходных файлов'), 0);
    else {
      const progress = jobProgressView(client.job);
      showProgress(progress.label, progress.detail, progress.percent);
    }
  } else updateStatus(client.connected ? 'connected' : 'disconnected', client.connected ? tr('connected','Подключено') : tr('disconnected','Нет соединения'));
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
  settings.operation = 'txt2img';
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
    [el.faceToggle, objectInfo.FaceDetailer && detector.includes('bbox/face_yolov8m.pt'), tr('needFace','Нужны FaceDetailer и bbox/face_yolov8m.pt')],
    [el.reactorToggle, objectInfo.ReActorFaceSwap && swaps.includes('inswapper_128.onnx'), tr('needSwap','Нужны ReActorFaceSwap и inswapper_128.onnx')],
    [el.hiresToggle, upscaleModelList.length && objectInfo.ImageUpscaleWithModel, tr('needUpscale','Нужны узел и веса увеличения')],
    [el.upscaleToggle, upscaleModelList.length && objectInfo.ImageUpscaleWithModel, tr('needUpscale','Нужны узел и веса увеличения')],
  ]) {
    toggle.disabled = !available;
    toggle.title = available ? '' : reason;
    toggle.closest('.improvement-card')?.setAttribute('title', available ? '' : reason);
  }
  for (const [select, field] of [[el.reactorDetection, 'facedetection'], [el.reactorRestore, 'face_restore_model']]) {
    const value = select.value;
    select.replaceChildren(...comboValues(objectInfo.ReActorFaceSwap?.input.required[field]).map(name => new Option(name, name)));
    if (value && ![...select.options].some(option => option.value === value)) {
      const missing = new Option(tr('unavailable',`Недоступно: ${value}`,{value}), value); missing.disabled = true; select.add(missing);
    }
    if (value) select.value = value;
  }
  ready = modelList.length > 0;
  if (!ready) warn(tr('noModels','ComfyUI не обнаружил checkpoint-моделей. Проверьте пути и обновите список.'));
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
    const view = presentResourceMetrics(await getPrismMetrics(), localization);
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
    const view = presentResourceMetrics(null, localization);
    el.ramVal.textContent = el.vramVal.textContent = '—';
    el.ramDetail.textContent = view.ram.detail;
    el.vramDetail.textContent = view.vram.detail;
    for (const fill of [el.ramFill, el.vramFill, el.vramWorkingFill, el.vramCacheFill]) fill.style.width = '0%';
  }
}
client.addEventListener('connection', event => {
  if (event.detail && message.textContent === translateMessage('api.interrupted','Соединение с ComfyUI прервано.')) warn('');
  render();
});
client.addEventListener('warning', event => warn(event.detail));
client.addEventListener('queue', event => {
  queueCount = event.detail;
  el.queueLengthText.textContent = tr('queuedJobs',`Заданий: ${event.detail}`,{count:event.detail});
  el.clearQueueBtn.disabled = event.detail < 1;
});
client.addEventListener('job', event => {
  const job = event.detail;
  render();
  if (job.error) warn(job.error);
  if (job.status === 'succeeded') {
    displayOutputImage(job);
  }
});
window.addEventListener('dashboard-warning', event => warn(event.detail));
window.addEventListener('prism-import-completed',event=>{
  setAppView('generation');
  if(event.detail.modelKind==='loras')return;
  const imported=event.detail.source.name.replaceAll('\\','/');
  const name=modelCatalog.find(model=>model.name.replaceAll('\\','/')===imported)?.name??imported;
  if(modelList.includes(name)){
    el.checkpointSelect.value=name;el.checkpointSelect.dispatchEvent(new Event('change'));
    warn(tr('modelAdded','Модель добавлена и выбрана для генерации.'));
  }else warn(modelCatalog.find(model=>model.name===name)?.reason??tr('modelAddedNeedsComponents','Файл модели добавлен. Для генерации нужны совместимые компоненты и поддерживаемый рецепт.'));
});
window.addEventListener('restore-history-settings', event => {
  applySettings(event.detail);
  saveSettings();
});
window.addEventListener('generate-image', () => run(generate));
window.addEventListener('prism-view-change',render);
window.addEventListener('model-recipe-changed',()=>{availability();render();});
window.addEventListener('refine-image', event => run(() => refine(event.detail)));
window.addEventListener('repeat-job', event => run(() => submit(event.detail.settings, event.detail.workflow)));
window.addEventListener('cancel-job', () => client.cancel().catch(error => warn(error.message)));
window.addEventListener('clear-queue', () => client.clearQueue().catch(error => warn(error.message)));
resetButton.addEventListener('click', () => { client.abandon(); warn(tr('abandoned','Связь с неизвестным заданием снята. Оно не отправлялось повторно.')); });
document.getElementById('refresh-models-btn').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const before = new Set(modelList);
  modelScanStatus = {kind:'scanning'};renderModelScanStatus();
  try {
    await refresh();
    const added = modelList.filter(name => !before.has(name)).length;
    modelScanStatus = {kind:'complete',total:modelList.length,added};
  } catch (error) { modelScanStatus = {kind:'failed',message:error.message}; }
  finally { button.disabled = false; renderModelScanStatus(); }
});
window.addEventListener('load', async () => {
  try {
    localization = await createLocalization({storage:createServerLanguageStore()});
  } catch (error) {
    const storage={getItem:()=>null,setItem:()=>{throw new Error('PRISM_LANGUAGE_WRITE');}};
    localization = await createLocalization({storage});
    warn(localization.language==='ru'?'Не удалось загрузить настройку языка.':'Could not load the language setting.');
  }
  setActiveLocalization(localization);
  document.documentElement.lang = localization.language;
  translateStatic(localization);
  window.addEventListener('prism-language-changed',event=>{
    document.documentElement.lang=event.detail.language;
    translateStatic(localization);
    syncBatchControls();
    renderModelScanStatus();
    if(queueCount!==null)el.queueLengthText.textContent=tr('queuedJobs',`Заданий: ${queueCount}`,{count:queueCount});
    availability();render();void stats();
  });
  initAppNavigation();
  setupUIEventListeners({localization});
  initPresetEvents();
  setupModelImport(refresh);
  const guide=setupFirstRun({
    localization,
    readiness:async()=>{
      await refresh();
      const stats=await client.request('/system_stats');
      if(!stats.system?.comfyui_version)throw new Error(tr('notComfy','Сервер не представился как ComfyUI'));
      return {backend:window.location.origin,version:stats.system.comfyui_version,models:modelCatalog};
    },
    importModel:()=>{setAppView('generation');document.getElementById('model-import-open').click();},
    applyExample:checkpoint=>{
      setAppView('generation');
      applySettings({checkpoint,recipe:'checkpoint',width:512,height:512,steps:20,cfg:7,sampler:'euler',scheduler:'normal',
        positive:'a small wooden cabin beside a lake, morning light, watercolor',negative:'',
        positiveParts:[{type:'text',text:'a small wooden cabin beside a lake, morning light, watercolor'}],
        batchCount:1,seedMode:'fixed',seedInput:'42',seed:42,variationStrength:0,
        advancedToggle:false,hiresToggle:false,faceToggle:false,upscaleToggle:false,reactorToggle:false,loras:[]});
      saveSettings();render();
    },
  });
  await initCharacters();
  setupSelectControls();
  initGalleryEvents();
  setupLivePreview(client);
  render();
  try {
    await refresh();
    const legacyHistory = loadSavedSettings();
    const [, catalogHistory] = await Promise.all([loadCustomProfiles(), initArchiveGallery({legacyHistory})]);
    updateHistory(catalogHistory);
    renderGallery();
    if (catalogHistory.length) selectHistoryItem(catalogHistory[0]);
    saveSettings();
    state.updateAllExpansions();
  } catch (error) { warn(error.message); }
  client.connect();
  if (client.job?.status === 'succeeded') {
    displayOutputImage(client.job);
  }
  render();
  void guide.openIfNeeded();
  stats();
  setInterval(stats, 5000);
});
