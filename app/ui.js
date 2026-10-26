import { checkpointSelect, stepsSlider, stepsVal, cfgSlider, cfgVal, samplerSelect, schedulerSelect, positiveTextarea, negativeTextarea, widthSlider, heightSlider, batchCountInput, hiresToggle, hiresScaleSelect, hiresDenoiseSlider, hiresDenoiseVal, faceToggle, faceThresholdSlider, faceThresholdVal, faceStepsSlider, faceStepsVal, upscaleToggle, upscaleSelect, advancedToggle, clipSkipSlider, clipSkipVal, vaeSelect, generateBtn, downloadBtn, seedInput, seedRandomBtn, seedLockBtn, seedPrevBtn, seedNextBtn, interruptBtn, clearQueueBtn, profileSelect, saveProfileBtn, outputImage, reactorToggle, reactorDropzone, reactorFileInput, reactorClearBtn, reactorDetection, reactorRestore, reactorVisibility, reactorVisibilityVal, reactorCodeformerWeight, reactorCodeformerWeightVal, reactorIndexSource, reactorIndexInput } from './elements.js';
import { setSeedMode, offsetSeed, handleReactorFile, clearReactorFile } from './state.js';
import { renderLoraStack } from './lora.js';
import { setupPromptEditor } from './prompt_editor.js';
import { modelList, modelCatalog, loraList, upscaleModelList, samplerList, schedulerList, vaeList } from './api.js';
import { resolveModelSelection } from './model_loader.js';
import { applyProfile, saveCustomProfile } from './presets.js';
import { updateCharLoraList } from './characters.js';
import { initImageFormats } from './formats.js';
import {syncBatchControls} from './batch.js';
import {setupPreferences} from './preferences.js';

export function syncModelLists() {
  populateSelect(checkpointSelect, modelList, "epicrealismXL_pureFix.safetensors");
  populateSelect(upscaleSelect, upscaleModelList, "4x-UltraSharp.pth");
  populateSelect(samplerSelect, samplerList, "dpmpp_2m_sde_gpu");
  populateSelect(schedulerSelect, schedulerList, "karras");
  populateSelect(vaeSelect, vaeList, "None");
  updateCharLoraList();
}

function populateSelect(selectEl, list, defaultVal) {
  const currentVal = selectEl.value;
  selectEl.innerHTML = "";
  list.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
  if (list.includes(currentVal)) {
    selectEl.value = currentVal;
  } else if (currentVal && selectEl.dataset.loaded) {
    const missing = new Option(`Недоступно: ${currentVal}`, currentVal);
    missing.disabled = true;
    selectEl.add(missing);
    selectEl.value = currentVal;
  } else if (list.includes(defaultVal)) {
    selectEl.value = defaultVal;
  }
  selectEl.dataset.loaded = 'true';
}

export function setupUIEventListeners() {
  const syncRecipeHint=()=>{
    const qwen=modelCatalog.find(model=>model.name===checkpointSelect.value)?.recipe==='qwen-image-2.1';
    const hint=document.getElementById('model-recipe-hint');
    hint.hidden=!qwen;
    hint.textContent=qwen?'Qwen Image 2.1 · INT8 · Старт: 25 шагов, CFG 1. Результат можно открыть в редакторе.':'';
    const negativeHint=document.getElementById('negative-prompt-hint');
    negativeHint.hidden=!qwen;
    negativeHint.textContent=qwen?(Number(cfgSlider.value)===1?'При CFG 1 поле «Что исключить» не влияет на Qwen. При необходимости попробуйте CFG 2.':'Для Qwen обычно используют CFG 1–2; высокий CFG ухудшает результат.'):'';
    for(const field of [advancedToggle,clipSkipSlider,vaeSelect])field.disabled=qwen;
    if(qwen)advancedToggle.checked=false;
  };
  window.addEventListener('model-recipe-changed',syncRecipeHint);
  cfgSlider.addEventListener('input',syncRecipeHint);
  syncRecipeHint();
  setupPreferences();
  const promptEditor=setupPromptEditor();
  const adjustInlineWeight=isIncrement=>promptEditor.transformTextAtCaret((text,position)=>{
    const field=document.createElement('textarea');field.value=text;field.setSelectionRange(position,position);
    adjustTagWeight(field,isIncrement);
    return {text:field.value,position:field.selectionStart};
  });
  promptEditor.root.addEventListener('keydown',event=>{
    if(!event.defaultPrevented&&event.ctrlKey&&['+','=','-','_','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();adjustInlineWeight(['+','=','ArrowUp'].includes(event.key));
    }
  });
  promptEditor.root.addEventListener('wheel',event=>{
    if(!event.defaultPrevented&&event.ctrlKey){event.preventDefault();adjustInlineWeight(event.deltaY<0);}
  },{passive:false});
  setupMobileLayout();
  syncBatchControls();
  batchCountInput.addEventListener('input',syncBatchControls);
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.deltaY === 0 || !(event.target instanceof Element)) return;
    const input = event.target.closest('.input-group')?.querySelector('input[type="range"], input[type="number"]');
    if (!input || input.disabled || input.readOnly || input.step === 'any') return;
    event.preventDefault();
    const previous = input.value;
    if (event.deltaY < 0) input.stepUp(); else input.stepDown();
    if (input.value === previous) return;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });
  seedRandomBtn.addEventListener("click", () => setSeedMode("random"));
  seedLockBtn.addEventListener("click", () => setSeedMode("lock"));
  const variationStrength = document.getElementById('variation-strength');
  variationStrength.addEventListener('input', () => {
    document.getElementById('variation-strength-val').textContent = Number(variationStrength.value).toFixed(2);
    if (Number(variationStrength.value) > 0 && seedRandomBtn.classList.contains('active')) setSeedMode('lock');
  });
  for (const input of [variationStrength,document.getElementById('variation-seed-input')]) {
    input.addEventListener('change', () => window.dispatchEvent(new CustomEvent('save-settings')));
  }
  
  seedInput.addEventListener("input", () => {
    const val = seedInput.value.trim();
    if (val === "random" || val === "") {
      setSeedMode("random");
    } else {
      setSeedMode("lock");
    }
  });
  
  seedPrevBtn.addEventListener("click", () => offsetSeed(-1));
  seedNextBtn.addEventListener("click", () => offsetSeed(1));
  initImageFormats();
  
  const setupSlider = (slider, valDisplay, onChangeCallback) => {
    slider.addEventListener("input", () => {
      valDisplay.textContent = slider.value;
      if (onChangeCallback) onChangeCallback(slider.value);
    });
    slider.addEventListener("change", () => {
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  };
  
  setupSlider(stepsSlider, stepsVal);
  setupSlider(cfgSlider, cfgVal);
  setupSlider(hiresDenoiseSlider, hiresDenoiseVal);
  setupSlider(faceThresholdSlider, faceThresholdVal);
  setupSlider(faceStepsSlider, faceStepsVal);
  setupSlider(clipSkipSlider, clipSkipVal);
  setupSlider(reactorVisibility, reactorVisibilityVal);
  setupSlider(reactorCodeformerWeight, reactorCodeformerWeightVal);
  
  const setupCardToggle = (toggle, cardSelector) => {
    toggle.addEventListener("change", () => {
      const card = document.querySelector(cardSelector);
      if (card) {
        if (toggle.checked) {
          card.classList.add("expanded");
        } else {
          card.classList.remove("expanded");
        }
      }
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  };

  setupCardToggle(hiresToggle, "#hires-card");
  setupCardToggle(faceToggle, "#face-card");
  setupCardToggle(upscaleToggle, "#upscale-card");
  setupCardToggle(advancedToggle, "#advanced-card");
  setupCardToggle(reactorToggle, "#reactor-card");


  generateBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('generate-image')));
  
  interruptBtn.addEventListener("click", async () => {
    window.dispatchEvent(new CustomEvent('cancel-job'));
  });
  
  clearQueueBtn.addEventListener("click", async () => {
    window.dispatchEvent(new CustomEvent('clear-queue'));
  });


  profileSelect.addEventListener("change", () => {
    applyProfile(profileSelect.value);
  });

  checkpointSelect.addEventListener("change", () => {
    const selection=resolveModelSelection(modelCatalog,checkpointSelect.value);
    if(selection.recommended){
      for(const [input,value,label] of [
        [stepsSlider,selection.recommended.steps,stepsVal],
        [cfgSlider,selection.recommended.cfg,cfgVal],
        [samplerSelect,selection.recommended.sampler,null],
        [schedulerSelect,selection.recommended.scheduler,null],
      ]){
        if([...input.options??[]].length&&input.tagName==='SELECT'&&![...input.options].some(option=>option.value===String(value)))continue;
        input.value=String(value);if(label)label.textContent=String(value);
      }
    }
    window.dispatchEvent(new CustomEvent('model-recipe-changed',{detail:{recipe:selection.recipe}}));
    // Перерисовываем стек LoRA, чтобы отфильтровать доступные варианты под новую модель
    renderLoraStack();
  });
  
  saveProfileBtn.addEventListener("click", saveCustomProfile);

  const inputs = [
    checkpointSelect, stepsSlider, cfgSlider, samplerSelect, schedulerSelect,
    positiveTextarea, negativeTextarea, batchCountInput,
    widthSlider, heightSlider, hiresToggle, hiresScaleSelect, faceToggle,
    faceThresholdSlider, faceStepsSlider, upscaleToggle, upscaleSelect,
    advancedToggle, clipSkipSlider, vaeSelect,
    reactorToggle, reactorDetection, reactorRestore, reactorVisibility,
    reactorCodeformerWeight, reactorIndexSource, reactorIndexInput
  ];
  inputs.forEach(el => el.addEventListener("change", () => {
    window.dispatchEvent(new CustomEvent("save-settings"));
  }));

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      if (!generateBtn.disabled) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('generate-image'));
      }
    }
  });

  // Привязка управления весом тегов для текстовых полей промптов
  const setupTextareaWeightControl = (textarea) => {
    textarea.addEventListener("wheel", (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        adjustTagWeight(textarea, e.deltaY < 0);
      }
    }, { passive: false });
    
    textarea.addEventListener("keydown", (e) => {
        if (e.ctrlKey && ['+','=','-','_','ArrowUp','ArrowDown'].includes(e.key)) {
        e.preventDefault();
          adjustTagWeight(textarea, ['+','=','ArrowUp'].includes(e.key));
      }
    });
  };

  setupTextareaWeightControl(positiveTextarea);
  setupTextareaWeightControl(negativeTextarea);

  // ReActor Drag & Drop and click handlers
  reactorDropzone.addEventListener("click", () => reactorFileInput.click());
  reactorFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleReactorFile(e.target.files[0]);
    }
  });
  
  reactorClearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearReactorFile();
  });
  
  reactorDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    reactorDropzone.style.borderColor = "var(--text-primary)";
  });
  
  reactorDropzone.addEventListener("dragleave", () => {
    reactorDropzone.style.borderColor = "var(--border-color)";
  });
  
  reactorDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    reactorDropzone.style.borderColor = "var(--border-color)";
    if (e.dataTransfer.files.length > 0) {
      handleReactorFile(e.dataTransfer.files[0]);
    }
  });

  const syncCodeformerSlider = () => {
    const weightGroup = document.getElementById("reactor-codeformer-weight-group");
    if (weightGroup) {
      if (reactorRestore.value === "codeformer-v0.1.0.pth") {
        weightGroup.style.display = "block";
      } else {
        weightGroup.style.display = "none";
      }
    }
  };
  reactorRestore.addEventListener("change", syncCodeformerSlider);
  syncCodeformerSlider();
}

function setupMobileLayout() {
  const mobile = matchMedia('(max-width: 1100px)');
  const moves = [
    ['.action-status-info', '#mobile-generation-controls'],
    ['#preview-toggle', '#mobile-generation-controls'],
    ['#generate-btn', '#mobile-generation-controls'],
    ['#interrupt-btn', '#mobile-generation-controls'],
    ['#progress-container', '#mobile-generation-controls'],
  ].map(([selector, target]) => {
    const element = document.querySelector(selector);
    const anchor = document.createComment('Место элемента в настольной панели');
    element.before(anchor);
    return { element, anchor, target: document.querySelector(target) };
  });
  const applyLayout = () => {
    for (const { element, anchor, target } of moves) {
      if (mobile.matches) target.append(element);
      else anchor.after(element);
    }
  };
  const showPanel = panel => {
    if (!mobile.matches) return;
    document.body.dataset.mobilePanel = panel;
    document.querySelectorAll('.mobile-nav button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mobilePanel === panel));
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  document.querySelectorAll('.mobile-nav button').forEach(button => {
    button.addEventListener('click', () => showPanel(button.dataset.mobilePanel));
  });
  generateBtn.addEventListener('click', () => showPanel('generate'));
  mobile.addEventListener('change', applyLayout);
  applyLayout();
}

// Вспомогательная функция для поиска границ тега вокруг каретки ввода
function findTagRange(text, pos) {
  let start = text.lastIndexOf(',', pos - 1);
  start = start === -1 ? 0 : start + 1;
  
  let end = text.indexOf(',', pos);
  end = end === -1 ? text.length : end;
  
  let tagStart = start;
  while (tagStart < end && /\s/.test(text[tagStart])) {
    tagStart++;
  }
  let tagEnd = end;
  while (tagEnd > tagStart && /\s/.test(text[tagEnd - 1])) {
    tagEnd--;
  }
  
  return { start: tagStart, end: tagEnd };
}

// Изменение веса тега в скобках (поддержка формата Stable Diffusion / ComfyUI)
function adjustTagWeight(textarea, isIncrement) {
  const text = textarea.value;
  const pos = textarea.selectionStart;
  if (pos === undefined) return;
  
  const range = findTagRange(text, pos);
  if (range.start === range.end) return;
  
  const rawTag = text.substring(range.start, range.end);
  
  let word = rawTag;
  let weight = 1.0;
  
  const matchWeight = rawTag.match(/^\(([^:]+):([0-9.]+)\)$/);
  if (matchWeight) {
    word = matchWeight[1];
    weight = parseFloat(matchWeight[2]);
  } else {
    const matchParens = rawTag.match(/^\(([^:]+)\)$/);
    if (matchParens) {
      word = matchParens[1];
      weight = 1.1;
    }
  }
  
  weight = isIncrement ? weight + 0.05 : weight - 0.05;
  weight = parseFloat(weight.toFixed(2));
  
  if (weight < 0.05) weight = 0.05;
  
  let newTag = `(${word}:${weight})`;
  if (weight === 1.0) {
    newTag = word;
  }
  
  const newText = text.substring(0, range.start) + newTag + text.substring(range.end);
  textarea.value = newText;
  
  const newCursorPos = range.start + newTag.length;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}
