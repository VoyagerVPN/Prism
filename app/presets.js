import { askText, askConfirm } from './dialogs.js';
import { profileSelect } from './elements.js';
import { modelList } from './api.js';
import { readSettings, applySettings } from './storage.js';
import { syncSelectControls } from './controls.js';

const keys = ['checkpoint','steps','cfg','sampler','scheduler','advancedToggle','clipSkip','vae'];
const modelSettings = settings => Object.fromEntries(keys.filter(key => settings[key] !== undefined).map(key => [key,settings[key]]));
let profiles = {}, revision, available = false, saving = false;
let selected = localStorage.getItem('prism_selected_model_preset') || '';
const status = () => document.getElementById('preset-status');

async function requestProfiles(options = {}) {
  const response = await fetch('/prism/presets', {cache:'no-store',signal:AbortSignal.timeout(15000),...options});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  if (!data.presets || typeof data.presets !== 'object' || Array.isArray(data.presets) || !('revision' in data)) throw new Error('Некорректный ответ хранилища пресетов');
  return data;
}

export function syncPresetStatus() {
  const saved = profiles[selected];
  const dirty = saved && JSON.stringify(modelSettings(readSettings())) !== JSON.stringify(modelSettings(saved));
  document.getElementById('update-profile-btn').disabled = !available || saving || !dirty;
  document.getElementById('reset-profile-btn').hidden = !dirty;
  document.getElementById('reset-profile-btn').disabled = !available || saving;
  document.getElementById('delete-profile-btn').disabled = !available || saving || !saved;
  document.getElementById('save-profile-btn').disabled = !available || saving;
  profileSelect.disabled = !available || saving;
  if (available && !saving) status().textContent = saved ? (dirty ? 'Изменено — сохраните изменения или верните сохранённые' : 'Сохранено в JSON') : 'Текущие настройки — без пресета';
}

export function renderProfiles() {
  if (!available) { syncPresetStatus(); syncSelectControls(); return; }
  if (!Object.hasOwn(profiles,selected)) selected = '';
  profileSelect.replaceChildren(new Option('Без пресета', 'default'));
  for (const [name, settings] of Object.entries(profiles)) {
    const missing = !modelList.includes(settings.checkpoint);
    const option = new Option(name + (missing ? ' — нет модели' : ''),name);
    option.disabled = missing;
    profileSelect.add(option);
  }
  profileSelect.value = selected || 'default';
  syncPresetStatus();
  syncSelectControls();
}

export async function loadCustomProfiles() {
  try {
    const data = await requestProfiles();
    profiles = data.presets; revision = data.revision; available = true;
    // Старый снимок оставляем в браузере для восстановления; переносим только настройки модели.
    if (!localStorage.getItem('prism_model_presets_migrated')) {
      const legacy = JSON.parse(localStorage.getItem('comfy_custom_profiles') || '{}');
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy) && Object.keys(legacy).length) {
        const imported = Object.fromEntries(Object.entries(legacy).map(([name,settings]) => [name,modelSettings({...readSettings(),...settings})]));
        const migrated = await requestProfiles({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presets:{...imported,...profiles},revision})});
        profiles = migrated.presets; revision = migrated.revision;
        localStorage.setItem('prism_model_presets_migrated','1');
      }
    }
    renderProfiles();
  } catch (error) {
    available = false; syncPresetStatus(); syncSelectControls();
    status().textContent = `Пресеты недоступны: ${error.message}. Обновите страницу для повтора.`;
  }
}

export function applyPresetData(profile) {
  if (profile.checkpoint && !modelList.includes(profile.checkpoint)) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', {detail:`Пресет не применён: модель ${profile.checkpoint} отсутствует.`}));
    return false;
  }
  applySettings(modelSettings(profile),{partial:true});
  window.dispatchEvent(new CustomEvent('save-settings'));
  return true;
}

export function applyProfile(name) {
  if (Object.hasOwn(profiles,name) && !applyPresetData(profiles[name])) return;
  selected = Object.hasOwn(profiles,name) ? name : '';
  localStorage.setItem('prism_selected_model_preset',selected);
  syncPresetStatus();
}

async function saveProfiles(next, nextSelected) {
  if (saving || !available) return;
  saving = true; syncPresetStatus(); status().textContent = 'Сохранение…';
  try {
    const data = await requestProfiles({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presets:next,revision})});
    profiles = data.presets; revision = data.revision; selected = nextSelected;
    localStorage.setItem('prism_selected_model_preset',selected);
  } catch (error) {
    available = false; status().textContent = `Не сохранено: ${error.message}. Обновите страницу для повтора.`;
  } finally { saving = false; renderProfiles(); }
}

export async function saveCustomProfile() {
  if (!available || saving) return;
  const snapshot = modelSettings(readSettings());
  const name = await askText('Название для текущих настроек модели:', '', {title:'Новый пресет модели'});
  if (!name) return;
  if (name === 'default' || Object.hasOwn(profiles,name)) { status().textContent = 'Название уже занято. Выберите другое или сохраните изменения выбранного пресета.'; return; }
  await saveProfiles({...profiles,[name]:snapshot},name);
}

export function initPresetEvents() {
  document.getElementById('reset-profile-btn').onclick = () => applyProfile(selected);
  document.getElementById('update-profile-btn').onclick = () => saveProfiles({...profiles,[selected]:modelSettings(readSettings())},selected);
  document.getElementById('delete-profile-btn').onclick = async () => {
    const name = selected;
    if (!name || !await askConfirm(`Удалить пресет «${name}»? Текущие настройки модели сохранятся в форме.`)) return;
    const next = {...profiles}; delete next[name];
    await saveProfiles(next,'');
  };
  document.getElementById('generation-model-card').addEventListener('input',syncPresetStatus);
  document.getElementById('generation-model-card').addEventListener('change',syncPresetStatus);
  window.addEventListener('save-settings',syncPresetStatus);
  window.addEventListener('settings-applied',syncPresetStatus);
  syncPresetStatus();
}
