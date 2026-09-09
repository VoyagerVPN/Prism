import * as el from './elements.js';
import { syncSelectControls } from './controls.js';
import { syncImageFormats } from './formats.js';
import {batchSizes,syncBatchControls} from './batch.js';
import { currentMode, activeWidth, activeHeight, seedMode, i2iImageName, i2iWidth, i2iHeight, reactorImageName, setI2IImage, setReactorImageName, clearI2IFile, clearReactorFile, switchMode, setActiveWidth, setActiveHeight, setSeedMode, updateAllExpansions } from './state.js';
import { activeLoras, updateActiveLoras } from './lora.js';
import { history, updateHistory, renderGallery, selectHistoryItem } from './gallery.js';
import { getSavedCharacters, getActiveCharacterSnapshot, renderCharacterSelect, loadCharacterData } from './characters.js';
import { randomUuid } from './config.js';
import { imageUrl } from './api.js';
import { readPositiveParts, writePositiveParts } from './prompt_editor.js';
import { promptPartsFromSettings, resolvePromptParts } from './prompt_parts.js';

const fields = {
  variationSeedInput: el.variationSeedInput, variationStrength: el.variationStrength,
  checkpoint: el.checkpointSelect, steps: el.stepsSlider, cfg: el.cfgSlider,
  sampler: el.samplerSelect, scheduler: el.schedulerSelect, positive: el.positiveTextarea,
  negative: el.negativeTextarea, batchCount: el.batchCountInput, i2iBatchCount: el.i2iBatchCountInput,
  denoise: el.i2iDenoiseSlider, hiresToggle: el.hiresToggle, hiresScale: el.hiresScaleSelect,
  hiresDenoise: el.hiresDenoiseSlider, faceToggle: el.faceToggle, faceThreshold: el.faceThresholdSlider,
  faceSteps: el.faceStepsSlider, upscaleToggle: el.upscaleToggle, upscaleSelect: el.upscaleSelect,
  advancedToggle: el.advancedToggle, clipSkip: el.clipSkipSlider, vae: el.vaeSelect,
  reactorToggle: el.reactorToggle, reactorDetection: el.reactorDetection, reactorRestore: el.reactorRestore,
  reactorVisibility: el.reactorVisibility, reactorCodeformerWeight: el.reactorCodeformerWeight,
  reactorIndexSource: el.reactorIndexSource, reactorIndexInput: el.reactorIndexInput,
};
let restoring = false;

export function readSettings() {
  const positiveParts=readPositiveParts();
  const settings = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name,
    input.type === 'checkbox' ? input.checked : ['range', 'number'].includes(input.type) ? Number(input.value) : input.value
  ]));
  const selectedCharacter = document.getElementById('character-select').value;
  const saved = getSavedCharacters()[selectedCharacter];
  let character = null;
  if (selectedCharacter !== 'none') {
    const snapshot=getActiveCharacterSnapshot();
    character = structuredClone(snapshot?.name===selectedCharacter?snapshot:saved ?? {});
    character.activeOutfitName = document.getElementById('char-outfit-select').value;
    character.name = selectedCharacter;
    character.lora = document.getElementById('char-lora-select').value;
    character.strength = Number(document.getElementById('char-lora-strength').value);
    character.appearance = document.getElementById('char-appearance-input').value;
    character.trigger = document.getElementById('char-trigger-input')?.value ?? character.trigger ?? '';
    character.activeAppearanceName = document.getElementById('char-appearance-select')?.value || 'По умолчанию';
    character.appearances ??= {};
    character.appearances[character.activeAppearanceName] = character.appearance;
    character.outfitEnabled = document.getElementById('char-outfit-toggle').checked;
    character.outfits ??= {};
    character.outfits[character.activeOutfitName ?? 'По умолчанию'] = document.getElementById('char-outfit-input').value;
  }
  return {
    ...settings, recipe: 'checkpoint', mode: currentMode, width: activeWidth, height: activeHeight,
    batchCount: batchSizes[currentMode === 'i2i' ? settings.i2iBatchCount : settings.batchCount],
    t2iBatchCount: batchSizes[settings.batchCount], i2iBatchCount:batchSizes[settings.i2iBatchCount],batchLayout:'square-v1',
    ...(positiveParts?{positiveParts,positive:resolvePromptParts(positiveParts).text}:{}),
    loras: positiveParts?resolvePromptParts(positiveParts).loras:activeLoras.map(({ name, strength, description }) => ({ name, strength: Number(strength), description: description ?? '' })),
    character, selectedCharacter, seedMode, seedInput: el.seedInput.value,
    inputImageName: i2iImageName, inputWidth: i2iWidth, inputHeight: i2iHeight, reactorImageName,
  };
}

export function applySettings(settings, { restoreCharacterSnapshot = true, partial = false } = {}) {
  restoring = true;
  try {
    const values = partial ? {...settings} : { ...settings, denoise: settings.denoise ?? settings.i2iDenoise, batchCount: settings.t2iBatchCount ?? settings.batchCount, variationSeedInput: settings.variationSeed ?? settings.variationSeedInput ?? 'random', variationStrength: settings.variationStrength ?? 0 };
    if (!partial) {
    values.batchCount = Math.max(0,batchSizes.indexOf(Number(values.batchCount ?? 1)));
    values.i2iBatchCount = Math.max(0,batchSizes.indexOf(Number(settings.i2iBatchCount ?? (settings.mode === 'i2i' ? settings.batchCount : 1))));
    }
    for (const [name, input] of Object.entries(fields)) {
      const value = values[name];
      if (value === undefined || value === null) continue;
      if (value === '' && input.tagName === 'SELECT' && ![...input.options].some(option => option.value === '')) continue;
      if (input.type === 'checkbox') input.checked = value === true;
      else {
        if (input.tagName === 'SELECT' && !Array.from(input.options).some(option => option.value === String(value))) {
          const missing = new Option(`Недоступно: ${value}`, String(value));
          missing.disabled = true;
          input.appendChild(missing);
        }
        input.value = value;
      }
    }
    if (settings.width !== undefined) { setActiveWidth(Number(settings.width)); el.widthSlider.value = settings.width; }
    if (settings.height !== undefined) { setActiveHeight(Number(settings.height)); el.heightSlider.value = settings.height; }
    syncImageFormats();
    syncBatchControls();
    for (const [input, label] of [[el.stepsSlider, el.stepsVal], [el.cfgSlider, el.cfgVal], [el.i2iDenoiseSlider, el.i2iDenoiseVal], [el.hiresDenoiseSlider, el.hiresDenoiseVal], [el.faceThresholdSlider, el.faceThresholdVal], [el.faceStepsSlider, el.faceStepsVal], [el.clipSkipSlider, el.clipSkipVal], [el.reactorVisibility, el.reactorVisibilityVal], [el.reactorCodeformerWeight, el.reactorCodeformerWeightVal]]) {
      label.textContent = input.value;
    }
    if (Array.isArray(settings.loras)) {
      updateActiveLoras(settings.loras.map(lora => ({ ...lora, id: randomUuid() })));
    }
    if(settings.positiveParts!==undefined||settings.positive!==undefined||Array.isArray(settings.loras))writePositiveParts(promptPartsFromSettings({...settings,positive:settings.positive??el.positiveTextarea.value,loras:settings.loras??activeLoras}));
    if (settings.mode) switchMode(settings.mode === 'i2i' ? 'i2i' : 't2i');
    if (settings.seedMode) setSeedMode(settings.seedMode);
    document.getElementById('variation-strength-val').textContent = Number(el.variationStrength.value).toFixed(2);
    document.getElementById('seed-variation').open = Number(el.variationStrength.value) > 0;
    if (settings.seed !== undefined) { setSeedMode('lock'); el.seedInput.value = settings.seed; }
    else if (settings.seedInput !== undefined) el.seedInput.value = settings.seedInput;
    if (settings.selectedCharacter !== undefined) {
      renderCharacterSelect(settings.selectedCharacter);
      const select = document.getElementById('character-select');
      if (restoreCharacterSnapshot && settings.character) {
        const name = settings.character.name;
        if (![...select.options].some(option => option.value === name)) select.add(new Option(`${name} (из снимка)`, name));
        select.value = name;
      }
      const selected = select.value;
      document.getElementById('character-details').style.display = selected === 'none' ? 'none' : 'flex';
      if (selected !== 'none') loadCharacterData(selected, restoreCharacterSnapshot ? settings.character : undefined);
    }
    if ('inputImageName' in settings) clearI2IFile();
    if ('reactorImageName' in settings) clearReactorFile();
    if (settings.inputImageName) {
      setI2IImage(settings.inputImageName, settings.inputWidth, settings.inputHeight);
      el.i2iPreview.src = imageUrl({ filename: settings.inputImageName, type: 'input' });
      el.i2iPreview.style.display = 'block';
      el.i2iClearBtn.style.display = 'block';
    }
    if (settings.reactorImageName) {
      setReactorImageName(settings.reactorImageName);
      el.reactorPreview.src = imageUrl({ filename: settings.reactorImageName, type: 'input' });
      el.reactorPreview.style.display = 'block';
      el.reactorClearBtn.style.display = 'block';
    }
    updateAllExpansions();
  } finally { restoring = false; syncSelectControls(); window.dispatchEvent(new Event('settings-applied')); }
}

export function saveSettings() {
  if (restoring) return;
  try {
    localStorage.setItem('matrix_dashboard_v3', JSON.stringify({ ...readSettings(), version: 3, history: history.slice(0, 15) }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', { detail: `Настройки не сохранены: ${error.message}` }));
  }
}

export function loadSavedSettings() {
  const raw = localStorage.getItem('matrix_dashboard_v3') ?? localStorage.getItem('comfy_dashboard_settings_v2');
  if (!raw) return;
  try {
    const settings = JSON.parse(raw);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Некорректный формат настроек');
    // При обычной загрузке источником персонажей служит JSON, а не старый снимок формы.
    applySettings(settings, { restoreCharacterSnapshot: false });
    if (Array.isArray(settings.history)) {
      updateHistory(settings.history.filter(item => item && typeof item.url === 'string').slice(0, 15).map(item => ({
        ...item, url: item.url.startsWith('data:') && item.batchUrls?.length ? item.batchUrls[0] : item.url
      })));
      renderGallery();
      if (history.length) selectHistoryItem(history[0]);
    }
  } catch (error) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', { detail: `Не удалось восстановить настройки: ${error.message}` }));
  }
}

window.addEventListener('save-settings', saveSettings);
