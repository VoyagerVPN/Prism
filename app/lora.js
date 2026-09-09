import { askText, showNotice } from './dialogs.js';
import { loraStackContainer, checkpointSelect } from './elements.js';
import { loraList, loraDetailsMap } from './api.js';
import { randomUuid } from './config.js';

export let activeLoras = [];

export function addLora(name = 'None') {
  if (!loraList.includes(name) || (name !== 'None' && activeLoras.some(lora => lora.name === name))) return;
  let description = '';
  try { description = JSON.parse(localStorage.getItem('comfy_lora_characters') || '{}')[name.replaceAll('\\','/')] || ''; } catch { /* Повреждённый шаблон не мешает подключить LoRA. */ }
  activeLoras.push({id:randomUuid(),name,strength:1,description});
  renderLoraStack();
  window.dispatchEvent(new CustomEvent('save-settings'));
}

export function updateActiveLoras(newList) {
  activeLoras = newList;
}

export function renderLoraStack() {
  loraStackContainer.innerHTML = "";
  
  activeLoras.forEach((lora, index) => {
    let descInput;
    const row = document.createElement("div");
    row.className = "lora-row";
    
    const header = document.createElement("div");
    header.className = "lora-header";
    const title = document.createElement('strong');
    title.textContent = `LoRA ${index + 1}`;
    
    const select = document.createElement("select");
    select.setAttribute("aria-label", "LoRA из библиотеки");
    select.className = 'lora-model-select';
    const baseModel = getBaseModelOfCheckpoint(checkpointSelect.value);
    
    const filteredLoras = loraList.filter(loraName => {
      if (loraName === "None" || loraName === lora.name) return true;
      const normalizedName = loraName.replace(/\\/g, '/');
      const loraInfo = loraDetailsMap[normalizedName];
      if (!loraInfo) return true;
      if (loraInfo.base_model !== "unknown" && baseModel !== "unknown") {
        return loraInfo.base_model === baseModel;
      }
      return true;
    });
    
    populateLoraSelect(select, filteredLoras, "None");
    select.value = lora.name;
    select.title = lora.name;
    select.addEventListener("change", () => {
      lora.name = select.value;
      select.title = lora.name;
      
      const savedChars = localStorage.getItem("comfy_lora_characters");
      if (savedChars) {
        try {
          const charsMap = JSON.parse(savedChars);
          const normalizedName = lora.name.replace(/\\/g, '/');
          if (charsMap[normalizedName]) {
            descInput.value = charsMap[normalizedName];
            lora.description = charsMap[normalizedName];
          } else {
            descInput.value = "";
            lora.description = "";
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        descInput.value = "";
        lora.description = "";
      }

      renderLoraTriggers(row, lora.name);
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
    
    const delBtn = document.createElement("button");
    delBtn.className = "delete-lora-btn";
    delBtn.title = "Удалить LoRA";
    delBtn.setAttribute('aria-label', `Удалить LoRA ${index + 1}`);
    delBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    delBtn.addEventListener("click", () => {
      activeLoras = activeLoras.filter(l => l.id !== lora.id);
      renderLoraStack();
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
    
    header.appendChild(title);
    header.appendChild(delBtn);
    
    const body = document.createElement("div");
    body.className = "lora-body";
    
    const inputGrp = document.createElement("div");
    inputGrp.className = "input-group";
    
    const labelRow = document.createElement("div");
    labelRow.style.display = "flex";
    labelRow.style.justifyContent = "space-between";
    
    const labelSpan = document.createElement("span");
    labelSpan.className = "input-label";
    labelSpan.textContent = "Вес LoRA";
    
    const valSpan = document.createElement("span");
    valSpan.className = "range-val";
    valSpan.textContent = parseFloat(lora.strength).toFixed(2);
    
    labelRow.appendChild(labelSpan);
    labelRow.appendChild(valSpan);
    
    const rangeContainer = document.createElement("div");
    rangeContainer.className = "range-container";
    
    const slider = document.createElement("input");
    slider.type = "range";
    slider.setAttribute("aria-label", "Вес LoRA");
    slider.min = "-1.0";
    slider.max = "2.0";
    slider.step = "0.05";
    slider.value = lora.strength;
    slider.addEventListener("input", () => {
      valSpan.textContent = parseFloat(slider.value).toFixed(2);
      lora.strength = parseFloat(slider.value);
    });
    slider.addEventListener("change", () => {
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
    
    rangeContainer.appendChild(slider);
    inputGrp.appendChild(labelRow);
    inputGrp.appendChild(rangeContainer);
    body.appendChild(inputGrp);
    
    descInput = document.createElement("textarea");
    descInput.className = "lora-desc-input";
    descInput.id = `lora-description-${index}`;
    descInput.placeholder = "Стиль, внешность, одежда или другие детали…";
    const descriptionLabel = document.createElement('label');
    descriptionLabel.className = 'input-label';
    descriptionLabel.htmlFor = descInput.id;
    descriptionLabel.textContent = 'Дополнение к описанию';
    descInput.value = lora.description || "";
    descInput.addEventListener("input", () => {
      lora.description = descInput.value;
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
    body.appendChild(descriptionLabel);
    body.appendChild(descInput);

    const descActions = document.createElement("div");
    descActions.className = "lora-desc-actions";
    
    const saveDescBtn = document.createElement("button");
    saveDescBtn.className = "save-lora-desc-btn";
    saveDescBtn.title = "Запомнить описание как шаблон для этой LoRA";
    saveDescBtn.textContent = "Сохранить описание";
    saveDescBtn.addEventListener("click", async () => {
      if (!lora.name || lora.name === "None") {
        await showNotice("Выберите конкретную LoRA перед сохранением шаблона.");
        return;
      }
      
      const savedChars = localStorage.getItem("comfy_lora_characters") || "{}";
      try {
        const charsMap = JSON.parse(savedChars);
        const normalizedName = lora.name.replace(/\\/g, '/');
        charsMap[normalizedName] = descInput.value;
        localStorage.setItem("comfy_lora_characters", JSON.stringify(charsMap));
        
        saveDescBtn.textContent = "Сохранено";
        setTimeout(() => {
          saveDescBtn.textContent = "Сохранить описание";
        }, 1200);
      } catch (e) {
        console.error(e);
        await showNotice("Не удалось сохранить описание персонажа.");
      }
    });
    
    descActions.appendChild(saveDescBtn);
    body.appendChild(descActions);
    
    const triggersContainer = document.createElement("div");
    triggersContainer.className = "lora-triggers-container";
    triggersContainer.style.display = "none";
    
    const triggersLabel = document.createElement("span");
    triggersLabel.className = "input-label";
    triggersLabel.style.fontSize = "0.6rem";
    triggersLabel.style.opacity = "0.7";
    triggersLabel.textContent = "Ключевые слова (клик — скопировать):";
    
    const triggersList = document.createElement("div");
    triggersList.className = "lora-triggers-list";
    
    triggersContainer.appendChild(triggersLabel);
    triggersContainer.appendChild(triggersList);
    body.appendChild(triggersContainer);
    
    row.appendChild(header);
    row.appendChild(select);
    row.appendChild(body);
    loraStackContainer.appendChild(row);
    
    renderLoraTriggers(row, lora.name);
  });
}

function renderLoraTriggers(rowEl, loraName) {
  const triggersContainer = rowEl.querySelector(".lora-triggers-container");
  const triggersList = rowEl.querySelector(".lora-triggers-list");
  
  if (!triggersContainer || !triggersList) return;
  
  const normalizedLoraName = loraName.replace(/\\/g, '/');
  const triggers = loraDetailsMap[normalizedLoraName] ? loraDetailsMap[normalizedLoraName].triggers : [];
  if (triggers && triggers.length > 0) {
    triggersList.innerHTML = "";
    triggers.forEach(tag => {
      const tagSpan = document.createElement("button");
      tagSpan.type = 'button';
      tagSpan.className = "lora-tag";
      tagSpan.textContent = tag;
      tagSpan.title = "Скопировать триггер";
      tagSpan.addEventListener("click", async () => {
        try {
          if (!navigator.clipboard) {
            await askText('Скопируйте триггер:', tag, {title:'Ключевое слово', action:'Готово', readOnly:true});
            return;
          }
          await navigator.clipboard.writeText(tag);
        } catch {
          await askText('Скопируйте триггер:', tag, {title:'Ключевое слово', action:'Готово', readOnly:true});
          return;
        }
        const origColor = tagSpan.style.borderColor;
        tagSpan.style.borderColor = "var(--status-idle)";
        setTimeout(() => tagSpan.style.borderColor = origColor, 800);
      });
      triggersList.appendChild(tagSpan);
    });
    triggersContainer.style.display = "flex";
  } else {
    triggersList.innerHTML = "";
    triggersContainer.style.display = "none";
  }
}

function populateLoraSelect(selectEl, list, defaultVal) {
  selectEl.innerHTML = "";
  list.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item === 'None' ? 'Выберите LoRA' : item.replace(/\\/g, '/').split('/').pop().replace(/\.safetensors$/i, '');
    opt.title = item;
    selectEl.appendChild(opt);
  });
  if (list.includes(defaultVal)) {
    selectEl.value = defaultVal;
  }
}

function getBaseModelOfCheckpoint(checkpointName) {
  if (!checkpointName) return "unknown";
  const name = checkpointName.toLowerCase();
  if (name.includes("pony")) return "pony";
  if (name.includes("illustrious") || name.includes("ill")) return "illustrious";
  if (name.includes("sdxl") || name.includes("epicrealismxl") || name.includes("kemono")) return "sdxl";
  if (name.includes("sd15") || name.includes("sd1.5") || name.includes("v1-5") || name.includes("epicrealism_")) return "sd15";
  return "unknown";
}
