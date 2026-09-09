import { loraList } from './api.js';
import { selectCharacterVariant, toggleCharacterVariantLink, renderVariantLink, variantOptionLabel } from './character_variants.js';
import { activeLoras, updateActiveLoras, renderLoraStack } from './lora.js';

let characters = {};
let activeCharacterSnapshot=null;

export function getActiveCharacterSnapshot() {
  return structuredClone(activeCharacterSnapshot);
}
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
  const $=id=>document.getElementById(id),card=$('character-card'),status=$('character-storage-status');
  // Поля остаются адаптером текущей формы для storage.js и генерации.
  $('character-details').hidden=true;
  const summary=document.createElement('div');summary.id='character-summary';summary.hidden=true;
  summary.innerHTML='<button type="button" id="edit-character-btn" class="add-lora-btn">Редактировать персонажа</button>';
  summary.append($('char-lora-strength').closest('.input-group'),$('char-outfit-input').closest('.input-group'));
  const appearanceLabel=document.createElement('div');appearanceLabel.className='input-group';appearanceLabel.innerHTML='<label class="input-label" for="char-appearance-select">Внешность</label>';
  const appearanceRow=document.createElement('div');appearanceRow.className='profile-variant-row';appearanceLabel.append(appearanceRow);
  const appearanceSelect=document.createElement('select');appearanceSelect.id='char-appearance-select';appearanceSelect.setAttribute('aria-label','Внешность персонажа');appearanceRow.append(appearanceSelect);
  summary.insertBefore(appearanceLabel,summary.querySelector('#char-outfit-input').closest('.input-group'));
  const trigger=document.createElement('input');trigger.type='hidden';trigger.id='char-trigger-input';summary.append(trigger);
  const linkButton=document.createElement('button');linkButton.type='button';linkButton.id='char-variant-link';linkButton.className='icon-btn-sm';appearanceRow.append(linkButton);
  linkButton.onclick=async()=>{const db=getSavedCharacters(),name=$('character-select').value,character=db[name];if(!character)return;toggleCharacterVariantLink(character);loadCharacterData(name,character);if(await saveCharactersDatabase(db))window.dispatchEvent(new Event('save-settings'));};
  $('add-character-btn').before(summary);
  $('edit-character-btn').onclick=()=>window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name:$('character-select').value,lora:$('char-lora-select').value}}));
  $('add-character-btn').onclick=()=>window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name:'',lora:'None'}}));
  const choose=document.createElement('button');choose.id='choose-character-btn';choose.className='add-lora-btn';choose.textContent='Выбрать в библиотеке';
  choose.onclick=()=>window.dispatchEvent(new Event('browse-characters'));card.append(choose);
  card.inert=true;status.textContent='Загрузка персонажей…';
  try {
    const data=await requestCharacters();characters=data.characters;characterRevision=data.revision;
    if(characterRevision===null) {
      const legacy=localStorage.getItem('comfy_characters');
      if(!await saveCharactersDatabase(legacy?JSON.parse(legacy):{}))throw new Error(status.textContent);
    }
    status.textContent='';card.inert=false;
  }catch(error){status.textContent=`Персонажи недоступны: ${error.message}. Обновите страницу для повтора.`;return;}
  updateCharLoraList();renderCharacterSelect();
  $('character-select').onchange=()=>activateCharacter($('character-select').value);
  $('char-lora-strength').oninput=()=>{$('char-lora-strength-val').textContent=Number($('char-lora-strength').value).toFixed(2);};
  for(const id of ['char-lora-strength','char-outfit-toggle','char-outfit-select','char-appearance-select'])$(id).onchange=async()=>{
    const db=getSavedCharacters(),name=$('character-select').value,character=db[name];if(!character)return;
    character.strength=Number($('char-lora-strength').value);character.outfitEnabled=$('char-outfit-toggle').checked;
    if(id==='char-appearance-select')selectCharacterVariant(character,'appearance',$('char-appearance-select').value);
    else if(id==='char-outfit-select')selectCharacterVariant(character,'outfit',$('char-outfit-select').value);
    loadCharacterData(name,character);
    if(await saveCharactersDatabase(db))window.dispatchEvent(new Event('save-settings'));
  };
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
    char.appearances ??= { 'По умолчанию': char.appearance || '' };
    char.activeAppearanceName ||= Object.keys(char.appearances)[0] || 'По умолчанию';
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
    opt.textContent = db[name].universe ? `${name} — ${db[name].universe}` : name;
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
    opt.textContent = variantOptionLabel(char,'outfit',name);
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
  activeCharacterSnapshot=structuredClone(char);
  
  document.getElementById("char-name-input").value = char.name || "";
  const loraSelect = document.getElementById('char-lora-select');
  const lora = char.lora || 'None';
  if (![...loraSelect.options].some(option => option.value === lora)) {
    const missing = new Option(`Недоступно: ${lora}`, lora); missing.disabled = true; loraSelect.add(missing);
  }
  loraSelect.value = lora;
  document.getElementById("char-lora-strength").value = char.strength !== undefined ? char.strength : 1.0;
  document.getElementById("char-lora-strength-val").textContent = parseFloat(document.getElementById("char-lora-strength").value).toFixed(2);
  const appearances=char.appearances??{'По умолчанию':char.appearance||''};
  const selectedAppearance=char.activeAppearanceName??Object.keys(appearances)[0];
  const appearanceSelect=document.getElementById('char-appearance-select');appearanceSelect.replaceChildren();
  for(const key of Object.keys(appearances))appearanceSelect.add(new Option(variantOptionLabel(char,'appearance',key),key));appearanceSelect.value=selectedAppearance;
  document.getElementById('char-trigger-input').value=char.trigger||'';
  renderVariantLink(document.getElementById('char-variant-link'),char);
  document.getElementById("char-appearance-input").value = appearances[selectedAppearance] || "";
  
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
  document.getElementById('edit-character-btn').textContent='Редактировать персонажа';
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
