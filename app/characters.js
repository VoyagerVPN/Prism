import { loraList } from './api.js';
import { selectCharacterVariant, toggleCharacterVariantLink, renderVariantLink, variantOptionLabel } from './character_variants.js';
import {insertPromptCharacter,syncPromptCharacter} from './prompt_editor.js';

let characters = {};
let activeCharacterSnapshot=null;

export function getActiveCharacterSnapshot() {
  return structuredClone(activeCharacterSnapshot);
}
let characterRevision;
let characterSaveQueue = Promise.resolve(true);

async function requestCharacters(options = {}) {
  const response = await fetch('/prism/characters', { cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
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
  const editButton=document.createElement('button');editButton.type='button';editButton.id='edit-character-btn';editButton.className='add-lora-btn';editButton.textContent='Изменить персонажа';
  const loraGroup=$('char-lora-select').closest('.input-group'),strengthGroup=$('char-lora-strength').closest('.input-group');
  const appearanceLabel=document.createElement('div');appearanceLabel.className='input-group';appearanceLabel.innerHTML='<label class="input-label" for="char-appearance-select">Внешность</label>';
  const appearanceRow=document.createElement('div');appearanceRow.className='profile-variant-row';appearanceLabel.append(appearanceRow);
  const appearanceSelect=document.createElement('select');appearanceSelect.id='char-appearance-select';appearanceSelect.setAttribute('aria-label','Внешность персонажа');appearanceRow.append(appearanceSelect);
  summary.append(appearanceLabel,$('char-outfit-input').closest('.input-group'),editButton);
  const technical=document.createElement('details');technical.className='character-technical';
  const technicalTitle=document.createElement('summary');technicalTitle.textContent='Техническая реализация';
  technical.append(technicalTitle,loraGroup,strengthGroup);summary.append(technical);
  const trigger=document.createElement('input');trigger.type='hidden';trigger.id='char-trigger-input';summary.append(trigger);
  const linkButton=document.createElement('button');linkButton.type='button';linkButton.id='char-variant-link';linkButton.className='icon-btn-sm';appearanceRow.append(linkButton);
  linkButton.onclick=async()=>{const db=getSavedCharacters(),name=$('character-select').value,character=db[name];if(!character)return;toggleCharacterVariantLink(character);loadCharacterData(name,character);if(await saveCharactersDatabase(db))window.dispatchEvent(new Event('save-settings'));};
  $('add-character-btn').before(summary);
  $('edit-character-btn').onclick=()=>window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name:$('character-select').value,lora:$('char-lora-select').value}}));
  $('add-character-btn').onclick=()=>window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name:'',lora:'None'}}));
  const choose=document.createElement('button');choose.id='choose-character-btn';choose.className='add-lora-btn';choose.textContent='Открыть библиотеку персонажей';
  choose.onclick=()=>window.dispatchEvent(new Event('browse-characters'));card.append(choose);
  card.inert=true;status.textContent='Загрузка персонажей…';
  try {
    const data=await requestCharacters();characters=data.characters;characterRevision=data.revision;
    if(characterRevision===null) {
      const legacy=localStorage.getItem('comfy_characters');
      if(!await saveCharactersDatabase(legacy?JSON.parse(legacy):{}))throw new Error(status.textContent);
    }
    status.textContent='';card.inert=false;
  }catch(error){status.textContent=`Персонажи недоступны: ${error.message}. Обновите страницу для повтора.`;window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:status.textContent}));return;}
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

export async function persistImportedCharacter(intent) {
  const sourceName=intent?.source?.name;
  if(typeof sourceName!=='string'||!sourceName.trim())throw new Error('Импортированный источник не содержит backend-имя.');
  const db=getSavedCharacters();
  let name,previous=null;
  if(intent.action==='attach'){
    name=intent.target?.characterName;
    if(typeof name!=='string'||!db[name])throw new Error('Выбранный персонаж больше не существует.');
    previous=structuredClone(db[name]);
    db[name].lora=sourceName;db[name].strength=Number(db[name].strength??1);
  }else if(intent.action==='create'){
    name=typeof intent.name==='string'?intent.name.trim():'';
    if(!name||name.length>200)throw new Error('Укажите имя нового персонажа.');
    if(Object.hasOwn(db,name))throw new Error(`Персонаж «${name}» уже существует. Выберите «Привязать к существующей».`);
    db[name]={
      name,lora:sourceName,strength:1,appearance:'',appearances:{'По умолчанию':''},activeAppearanceName:'По умолчанию',
      outfits:{'По умолчанию':''},activeOutfitName:'По умолчанию',outfitEnabled:true,
    };
  }else throw new Error('Неизвестное действие с импортированным персонажем.');
  const selected=document.getElementById('character-select')?.value??'none';
  if(!await saveCharactersDatabase(db,{optimistic:false}))throw new Error(document.getElementById('character-storage-status')?.textContent||'Не удалось сохранить персонажа.');
  if(previous)syncPromptCharacter(name,db[name],previous);
  renderCharacterSelect(selected);window.dispatchEvent(new Event('characters-updated'));
  return structuredClone(db[name]);
}

export async function assignCharacterPortrait(name, source) {
  const status=document.getElementById('character-storage-status');
  const response=await fetch('/prism/media/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,target:{kind:'character',name},revision:characterRevision}),signal:AbortSignal.timeout(90000)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Не удалось назначить портрет: HTTP ${response.status}`);
  if(!data.characters||typeof data.characters!=='object'||Array.isArray(data.characters)||!('revision' in data))throw new Error('Некорректный ответ хранилища персонажей');
  characters=structuredClone(data.characters);characterRevision=data.revision;
  const selected=document.getElementById('character-select')?.value||'none';renderCharacterSelect(selected);
  if(selected!=='none'&&characters[selected])loadCharacterData(selected,characters[selected]);
  if(status)status.textContent='Портрет персонажа сохранён';
  window.dispatchEvent(new Event('characters-updated'));
  return data.media;
}

export async function saveCharactersDatabase(db,{optimistic=true}={}) {
  const card = document.getElementById('character-select').closest('.section-card');
  const status = document.getElementById('character-storage-status');
  // Последовательная запись позволяет продолжать ввод, пока сохраняется предыдущее поле.
  if(optimistic)characters = structuredClone(db);
  status.textContent = 'Сохранение…';
  characterSaveQueue = characterSaveQueue.then(async previousSaved => {
  if (!previousSaved) return false;
  try {
    const data = await requestCharacters({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characters: db, revision: characterRevision }),
    });
    characterRevision = data.revision;
    if(!optimistic)characters = structuredClone(db);
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
  document.getElementById('edit-character-btn').textContent='Изменить персонажа';
}

export function activateCharacter(name, snapshot) {
  renderCharacterSelect(name);
  const selected=document.getElementById('character-select').value;
  document.getElementById('character-details').style.display=selected==='none'?'none':'flex';
  if(selected!=='none') {
    loadCharacterData(selected,snapshot);
    insertPromptCharacter({...structuredClone(snapshot??getSavedCharacters()[selected]),name:selected});
  }
  syncCharacterSummary();
  window.dispatchEvent(new CustomEvent('save-settings'));
}
