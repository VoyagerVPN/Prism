import { askText, askConfirm, showNotice } from './dialogs.js';
import { loraList } from './api.js';
import { activeLoras, updateActiveLoras, renderLoraStack } from './lora.js';

let characters = {};
let characterRevision;
let characterSaveQueue = Promise.resolve(true);

async function requestCharacters(options = {}) {
  const response = await fetch('/dashboard/characters', { cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Ошибка сохранения: HTTP ${response.status}`);
  if (!data.characters || typeof data.characters !== 'object' || Array.isArray(data.characters) || !('revision' in data)) throw new Error('Некорректный ответ хранилища персонажей');
  return data;
}

export async function initCharacters() {
  const card = document.getElementById('character-select').closest('.section-card');
  const status = document.getElementById('character-storage-status');
  const editor = document.createElement('dialog');
  editor.id = 'character-editor';
  editor.className = 'app-dialog';
  editor.setAttribute('aria-labelledby', 'character-editor-title');
  editor.innerHTML = '<header class="dialog-heading"><div><h2 id="character-editor-title">Основа персонажа</h2><p>Имя, LoRA и постоянная внешность</p></div><button type="button" id="close-character-editor" aria-label="Закрыть редактор">Закрыть</button></header><p id="character-editor-status" role="status"></p>';
  const details = document.getElementById('character-details');
  const identity = document.createElement('div');
  identity.className = 'character-identity';
  identity.append(...[...details.children].slice(0, 2));
  details.prepend(identity);
  editor.append(details);
  document.body.append(editor);
  const summary = document.createElement('div');
  summary.id = 'character-summary';
  summary.hidden = true;
  summary.innerHTML = '<button type="button" id="edit-character-btn" class="add-lora-btn">Настроить внешность и LoRA</button>';
  summary.append(document.getElementById('char-lora-strength').closest('.input-group'));
  summary.append(document.getElementById('char-outfit-input').closest('.input-group'));
  document.getElementById('add-character-btn').before(summary);
  document.getElementById('edit-character-btn').onclick = () => {
    const name=document.getElementById('character-select').value;
    const lora=document.getElementById('char-lora-select').value;
    if(lora && lora!=='None') window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name,lora}}));
    else editor.showModal();
  };
  const choose=document.createElement('button');choose.id='choose-character-btn';choose.className='add-lora-btn';choose.textContent='Выбрать в библиотеке';
  choose.onclick=()=>window.dispatchEvent(new Event('browse-characters'));card.append(choose);
  document.getElementById('close-character-editor').onclick = () => editor.close();
  new MutationObserver(() => {
    document.getElementById('character-editor-status').textContent = status.textContent;
  }).observe(status, {childList:true, subtree:true, characterData:true});
  card.inert = true;
  status.textContent = 'Загрузка персонажей…';
  try {
    const data = await requestCharacters();
    characters = data.characters;
    characterRevision = data.revision;
    if (characterRevision === null) {
      // Импортируем браузерную базу один раз; оригинал остаётся для восстановления.
      const legacy = localStorage.getItem('comfy_characters');
      const imported = legacy ? JSON.parse(legacy) : {};
      if (!await saveCharactersDatabase(imported)) throw new Error(status.textContent);
    }
    status.textContent = '';
    card.inert = false;
  } catch (error) {
    card.inert = true;
    status.textContent = `Персонажи недоступны: ${error.message}. Обновите страницу для повтора.`;
    return;
  }
  const characterSelect = document.getElementById("character-select");
  const charLoraSelect = document.getElementById("char-lora-select");
  const charLoraStrength = document.getElementById("char-lora-strength");
  const charLoraStrengthVal = document.getElementById("char-lora-strength-val");
  const addCharacterBtn = document.getElementById("add-character-btn");
  const saveCharacterBtn = document.getElementById("save-character-btn");
  const deleteCharacterBtn = document.getElementById("delete-character-btn");
  const characterDetails = document.getElementById("character-details");
  
  const charNameInput = document.getElementById("char-name-input");
  const charAppearanceInput = document.getElementById("char-appearance-input");
  const charOutfitInput = document.getElementById("char-outfit-input");
  const charOutfitToggle = document.getElementById("char-outfit-toggle");

  const charOutfitSelect = document.getElementById("char-outfit-select");
  const addOutfitBtn = document.getElementById("add-outfit-btn");
  const renameOutfitBtn = document.getElementById("rename-outfit-btn");
  const deleteOutfitBtn = document.getElementById("delete-outfit-btn");

  charLoraStrength.addEventListener("input", () => {
    charLoraStrengthVal.textContent = parseFloat(charLoraStrength.value).toFixed(2);
  });
  charLoraStrength.addEventListener("change", async () => {
    window.dispatchEvent(new CustomEvent("save-settings"));
  });

  updateCharLoraList();
  renderCharacterSelect();

  characterSelect.addEventListener("change", async () => {
    activateCharacter(characterSelect.value);
  });

  addCharacterBtn.addEventListener("click", async () => {
    const savedChars = getSavedCharacters();
    let newIndex = 1;
    while (savedChars[`Новый персонаж ${newIndex}`]) {
      newIndex++;
    }
    const newName = `Новый персонаж ${newIndex}`;
    
    const newChar = {
      name: newName,
      lora: "None",
      strength: 1.0,
      appearance: "",
      outfits: { "По умолчанию": "" },
      activeOutfitName: "По умолчанию",
      outfitEnabled: true
    };
    
    savedChars[newName] = newChar;
    if (!await saveCharactersDatabase(savedChars)) return;
    
    renderCharacterSelect(newName);
    loadCharacterData(newName);
    characterDetails.style.display = "flex";
    editor.showModal();
    window.dispatchEvent(new CustomEvent("save-settings"));
  });

  saveCharacterBtn.addEventListener("click", async () => {
    const activeSelection = characterSelect.value;
    if (activeSelection === "none") return;

    const inputName = charNameInput.value.trim();
    if (!inputName) {
      await showNotice("Пожалуйста, введите имя персонажа.");
      return;
    }

    const savedChars = getSavedCharacters();
    const existingChar = savedChars[activeSelection] || {};
    if (activeSelection !== inputName && Object.hasOwn(savedChars, inputName)) {
      await showNotice('Персонаж с таким именем уже существует. Выберите другое имя.');
      return;
    }
    
    if (activeSelection !== inputName) {
      delete savedChars[activeSelection];
    }

    const outfits = existingChar.outfits || { "По умолчанию": existingChar.outfit || "" };
    const activeOutfit = existingChar.activeOutfitName || "По умолчанию";
    outfits[activeOutfit] = charOutfitInput.value;

    savedChars[inputName] = {
      name: inputName,
      lora: charLoraSelect.value,
      strength: parseFloat(charLoraStrength.value),
      appearance: charAppearanceInput.value,
      outfits: outfits,
      activeOutfitName: activeOutfit,
      outfitEnabled: charOutfitToggle.checked
    };

    if (!await saveCharactersDatabase(savedChars)) return;
    
    renderCharacterSelect(inputName);
    loadCharacterData(inputName);
    
    saveCharacterBtn.textContent = "Сохранено";
    setTimeout(() => {
      saveCharacterBtn.textContent = "Сохранить";
    }, 1200);

    window.dispatchEvent(new CustomEvent("save-settings"));
  });

  deleteCharacterBtn.addEventListener("click", async () => {
    const activeSelection = characterSelect.value;
    if (activeSelection === "none") return;

    if (await askConfirm(`Вы уверены, что хотите удалить персонажа "${activeSelection}"?`)) {
      const savedChars = getSavedCharacters();
      delete savedChars[activeSelection];
      if (!await saveCharactersDatabase(savedChars)) return;
      
      renderCharacterSelect("none");
      characterDetails.style.display = "none";
      editor.close();
      window.dispatchEvent(new CustomEvent("save-settings"));
    }
  });

  const charInputs = [charAppearanceInput, charOutfitInput, charLoraSelect, charOutfitToggle, charLoraStrength];
  charInputs.forEach(el => {
    el.addEventListener("change", async () => {
      const activeSelection = characterSelect.value;
      if (activeSelection !== "none") {
        const savedChars = getSavedCharacters();
        if (savedChars[activeSelection]) {
          savedChars[activeSelection].lora = charLoraSelect.value;
          savedChars[activeSelection].strength = parseFloat(charLoraStrength.value);
          savedChars[activeSelection].appearance = charAppearanceInput.value;
          
          const outfits = savedChars[activeSelection].outfits || { "По умолчанию": savedChars[activeSelection].outfit || "" };
          const activeOutfit = savedChars[activeSelection].activeOutfitName || "По умолчанию";
          outfits[activeOutfit] = charOutfitInput.value;
          savedChars[activeSelection].outfits = outfits;
          
          savedChars[activeSelection].outfitEnabled = charOutfitToggle.checked;
          if (!await saveCharactersDatabase(savedChars)) return;
        }
      }
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  });

  if (charOutfitSelect) {
    charOutfitSelect.addEventListener("change", async () => {
      const activeSelection = characterSelect.value;
      if (activeSelection === "none") return;
      
      const savedChars = getSavedCharacters();
      const char = savedChars[activeSelection];
      if (!char) return;
      
      const currentActiveOutfit = char.activeOutfitName || "По умолчанию";
      if (!char.outfits) char.outfits = {};
      char.outfits[currentActiveOutfit] = charOutfitInput.value;
      
      const nextActiveOutfit = charOutfitSelect.value;
      char.activeOutfitName = nextActiveOutfit;
      charOutfitInput.value = char.outfits[nextActiveOutfit] || "";
      
      if (!await saveCharactersDatabase(savedChars)) return;
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  }

  if (addOutfitBtn) {
    addOutfitBtn.addEventListener("click", async () => {
      const activeSelection = characterSelect.value;
      if (activeSelection === "none") return;
      
      const savedChars = getSavedCharacters();
      const char = savedChars[activeSelection];
      if (!char) return;
      
      const newName = await askText("Введите название нового комплекта одежды:");
      if (!newName) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      
      if (!char.outfits) char.outfits = {};
      if (char.outfits[trimmed] !== undefined) {
        await showNotice("Комплект с таким названием уже существует.");
        return;
      }
      
      const currentActiveOutfit = char.activeOutfitName || "По умолчанию";
      char.outfits[currentActiveOutfit] = charOutfitInput.value;
      
      char.outfits[trimmed] = "";
      char.activeOutfitName = trimmed;
      charOutfitInput.value = "";
      
      if (!await saveCharactersDatabase(savedChars)) return;
      renderOutfitSelect(char);
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  }

  if (renameOutfitBtn) {
    renameOutfitBtn.addEventListener("click", async () => {
      const activeSelection = characterSelect.value;
      if (activeSelection === "none") return;
      
      const savedChars = getSavedCharacters();
      const char = savedChars[activeSelection];
      if (!char) return;
      
      const currentActiveOutfit = char.activeOutfitName || "По умолчанию";
      const newName = await askText(`Переименовать комплект "${currentActiveOutfit}" в:`, currentActiveOutfit);
      if (!newName) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === currentActiveOutfit) return;
      
      if (!char.outfits) char.outfits = {};
      if (char.outfits[trimmed] !== undefined) {
        await showNotice("Комплект с таким названием уже существует.");
        return;
      }
      
      const currentText = charOutfitInput.value;
      char.outfits[trimmed] = currentText;
      delete char.outfits[currentActiveOutfit];
      char.activeOutfitName = trimmed;
      
      if (!await saveCharactersDatabase(savedChars)) return;
      renderOutfitSelect(char);
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  }

  if (deleteOutfitBtn) {
    deleteOutfitBtn.addEventListener("click", async () => {
      const activeSelection = characterSelect.value;
      if (activeSelection === "none") return;
      
      const savedChars = getSavedCharacters();
      const char = savedChars[activeSelection];
      if (!char) return;
      
      if (!char.outfits) char.outfits = {};
      const keys = Object.keys(char.outfits);
      if (keys.length <= 1) {
        await showNotice("Нельзя удалить единственный комплект одежды.");
        return;
      }
      
      const currentActiveOutfit = char.activeOutfitName || "По умолчанию";
      if (!await askConfirm(`Вы уверены, что хотите удалить комплект одежды "${currentActiveOutfit}"?`)) {
        return;
      }
      
      delete char.outfits[currentActiveOutfit];
      const nextActiveOutfit = Object.keys(char.outfits)[0];
      char.activeOutfitName = nextActiveOutfit;
      charOutfitInput.value = char.outfits[nextActiveOutfit] || "";
      
      if (!await saveCharactersDatabase(savedChars)) return;
      renderOutfitSelect(char);
      window.dispatchEvent(new CustomEvent("save-settings"));
    });
  }
}

export function updateCharLoraList() {
  const charLoraSelect = document.getElementById("char-lora-select");
  if (!charLoraSelect) return;
  
  const currentVal = charLoraSelect.value;
  charLoraSelect.innerHTML = "";
  
  loraList.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    charLoraSelect.appendChild(opt);
  });
  
  if (loraList.includes(currentVal)) {
    charLoraSelect.value = currentVal;
  } else {
    charLoraSelect.value = "None";
  }
}

export function getSavedCharacters() {
  const db = structuredClone(characters);
  for (const char of Object.values(db)) {
    char.outfits ??= { 'По умолчанию': char.outfit || '' };
    char.activeOutfitName ||= Object.keys(char.outfits)[0] || 'По умолчанию';
  }
  return db;
}

export async function saveCharactersDatabase(db) {
  const card = document.getElementById('character-select').closest('.section-card');
  const status = document.getElementById('character-storage-status');
  // Последовательная запись позволяет продолжать ввод, пока сохраняется предыдущее поле.
  characters = structuredClone(db);
  status.textContent = 'Сохранение…';
  characterSaveQueue = characterSaveQueue.then(async previousSaved => {
  if (!previousSaved) return false;
  try {
    const data = await requestCharacters({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characters: db, revision: characterRevision }),
    });
    characterRevision = data.revision;
    status.textContent = 'Изменения сохранены';
    return true;
  } catch (error) {
    card.inert = true;
    status.textContent = `Не сохранено: ${error.message}`;
    return false;
  }
  });
  return characterSaveQueue;
}

export function renderCharacterSelect(selectValue = "none") {
  const characterSelect = document.getElementById("character-select");
  if (!characterSelect) return;
  
  const activeVal = selectValue || characterSelect.value;
  
  characterSelect.innerHTML = '<option value="none">Без персонажа</option>';
  
  const db = getSavedCharacters();
  Object.keys(db).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    characterSelect.appendChild(opt);
  });
  
  if (Object.keys(db).includes(activeVal)) {
    characterSelect.value = activeVal;
  } else {
    characterSelect.value = "none";
  }
  syncCharacterSummary();
}

export function renderOutfitSelect(char) {
  const outfitSelect = document.getElementById("char-outfit-select");
  if (!outfitSelect) return;
  
  outfitSelect.innerHTML = "";
  const outfits = char.outfits || { "По умолчанию": "" };
  const activeName = char.activeOutfitName || "По умолчанию";
  
  Object.keys(outfits).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    outfitSelect.appendChild(opt);
  });
  
  if (outfits[activeName] !== undefined) {
    outfitSelect.value = activeName;
  } else {
    const fallback = Object.keys(outfits)[0] || "По умолчанию";
    char.activeOutfitName = fallback;
    outfitSelect.value = fallback;
  }
}

export function loadCharacterData(name, snapshot) {
  const db = getSavedCharacters();
  const char = snapshot ?? db[name];
  if (!char) return;
  
  document.getElementById("char-name-input").value = char.name || "";
  const loraSelect = document.getElementById('char-lora-select');
  const lora = char.lora || 'None';
  if (![...loraSelect.options].some(option => option.value === lora)) {
    const missing = new Option(`Недоступно: ${lora}`, lora); missing.disabled = true; loraSelect.add(missing);
  }
  loraSelect.value = lora;
  document.getElementById("char-lora-strength").value = char.strength !== undefined ? char.strength : 1.0;
  document.getElementById("char-lora-strength-val").textContent = parseFloat(document.getElementById("char-lora-strength").value).toFixed(2);
  document.getElementById("char-appearance-input").value = char.appearance || "";
  
  const outfits = char.outfits || { "По умолчанию": char.outfit || "" };
  const activeOutfit = char.activeOutfitName || "По умолчанию";
  
  document.getElementById("char-outfit-input").value = outfits[activeOutfit] !== undefined ? outfits[activeOutfit] : "";
  document.getElementById("char-outfit-toggle").checked = char.outfitEnabled !== undefined ? char.outfitEnabled : true;
  
  renderOutfitSelect(char);
  syncCharacterSummary();
}

export function syncCharacterSummary() {
  const summary = document.getElementById('character-summary');
  if (!summary) return;
  summary.hidden = document.getElementById('character-select').value === 'none';
  const linked=!summary.hidden && document.getElementById('char-lora-select').value!=='None';
  document.getElementById('character-card').classList.toggle('linked-character',linked);
  document.getElementById('edit-character-btn').textContent=linked?'Настроить в библиотеке':'Настроить персонажа';
}

export function activateCharacter(name, snapshot) {
  renderCharacterSelect(name);
  const selected=document.getElementById('character-select').value;
  document.getElementById('character-details').style.display=selected==='none'?'none':'flex';
  if(selected!=='none') {
    loadCharacterData(selected,snapshot);
    const lora=document.getElementById('char-lora-select').value.replaceAll('\\','/');
    updateActiveLoras(activeLoras.filter(item=>item.name.replaceAll('\\','/')!==lora));
    renderLoraStack();
  }
  syncCharacterSummary();
  window.dispatchEvent(new CustomEvent('save-settings'));
}
