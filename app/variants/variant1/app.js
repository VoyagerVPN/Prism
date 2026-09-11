import {
  applyComposition,
  createRecipeState,
  displayVariantLabel,
  joinTags,
  normalizeCharacter,
  selectVariant,
  splitTags,
  updateRecipe,
} from './recipe.js';

const STORAGE_PREFIX = 'prism-variant1';
const STORAGE = {
  recipes: `${STORAGE_PREFIX}-recipes-v1`,
  cards: `${STORAGE_PREFIX}-card-drafts-v1`,
  selected: `${STORAGE_PREFIX}-selected-v1`,
};

const FALLBACK_CHARACTERS = {
  Isabella: {
    name: 'Isabella',
    lora: 'Character\\Isabella_García-Shapiro.safetensors',
    strength: 1,
    trigger: 'IsabellaGarciaShapiro',
    appearances: { 'По умолчанию': 'black hair, long hair, hair bow, pink bow, dark blue eyes' },
    activeAppearanceName: 'По умолчанию',
    outfits: { 'По умолчанию': 'white shirt, turtle neck shirt, pink dress, pink skirt, pink shoes, white socks' },
    activeOutfitName: 'По умолчанию',
    outfitEnabled: false,
    universe: 'Финес и Ферб',
    source: {
      title: 'Isabella García-Shapiro - Phineas and Ferb',
      author: 'NeoB1tch',
      base: 'Illustrious',
      version: 'V1',
      tags: ['isabella', 'isabella garcía-shapiro', 'character', 'phineas and ferb'],
      triggers: [
        'IsabellaGarciaShapiro, black hair, long hair, hair bow, pink bow, dark blue eyes',
        'white shirt, turtle neck shirt, pink dress, pink skirt, pink shoes, white socks',
      ],
    },
  },
};

const $ = (id) => document.getElementById(id);
const readStore = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const normalizedPath = (value) => String(value || '').replaceAll('\\', '/').toLocaleLowerCase();

let baseCharacters = {};
let characters = {};
let loraItems = [];
let loraByName = new Map();
let recipeDrafts = readStore(STORAGE.recipes, {});
let cardDrafts = readStore(STORAGE.cards, {});
let currentName = '';
let currentCharacter = null;
let state = null;
let tagTarget = 'appearance';
let toastTimer;
let editorDraft = null;

function variantLabel(character, kind, key) {
  return displayVariantLabel(character, kind, key);
}

function sourceFor(character) {
  return loraByName.get(normalizedPath(character.lora)) || character.source || {};
}

function saveCurrentRecipe() {
  if (!state || !currentName) return;
  recipeDrafts[currentName] = state;
  writeStore(STORAGE.recipes, recipeDrafts);
  $('save-state').innerHTML = '<i></i>Черновик сохранён локально';
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

function availablePreview(character) {
  const source = sourceFor(character);
  return source.preview || '';
}

function renderCharacterList() {
  const query = $('character-search').value.trim().toLocaleLowerCase();
  const list = $('character-list');
  list.replaceChildren();
  const entries = Object.entries(characters)
    .filter(([name, character]) => `${name} ${character.universe || ''}`.toLocaleLowerCase().includes(query))
    .sort(([a], [b]) => (a === 'Isabella' ? -1 : b === 'Isabella' ? 1 : a.localeCompare(b, 'ru')));
  $('character-count').textContent = Object.keys(characters).length;
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list'; empty.textContent = 'Персонажи не найдены'; list.append(empty); return;
  }
  for (const [name, character] of entries) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `character-item${name === currentName ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(name === currentName));
    const avatar = document.createElement('span'); avatar.className = 'character-avatar';
    const preview = availablePreview(character);
    if (preview) {
      const image = document.createElement('img'); image.src = preview; image.alt = ''; avatar.append(image);
    } else avatar.textContent = name.slice(0, 1).toLocaleUpperCase();
    const text = document.createElement('span'); text.className = 'character-text';
    const title = document.createElement('strong'); title.textContent = name;
    const sub = document.createElement('small'); sub.textContent = character.universe || sourceFor(character).title || (character.lora === 'None' ? 'Без LoRA' : 'Персонаж');
    text.append(title, sub);
    const dot = document.createElement('i'); dot.className = 'active-dot';
    button.append(avatar, text, dot);
    button.addEventListener('click', () => selectCharacter(name));
    list.append(button);
  }
}

function selectCharacter(name, options = {}) {
  if (!characters[name]) return;
  if (!options.skipSave) saveCurrentRecipe();
  currentName = name;
  currentCharacter = normalizeCharacter(name, characters[name]);
  state = createRecipeState(currentCharacter, options.fresh ? {} : recipeDrafts[name]);
  localStorage.setItem(STORAGE.selected, name);
  renderAll();
  saveCurrentRecipe();
}

function renderIdentity() {
  const source = sourceFor(currentCharacter);
  $('character-name').textContent = currentCharacter.name;
  $('character-base').textContent = source.base || currentCharacter.source?.base || 'Карточка';
  $('character-source').textContent = [source.author || currentCharacter.source?.author, currentCharacter.universe].filter(Boolean).join(' · ') || 'Локальная карточка';
  $('portrait-initial').textContent = currentCharacter.name.slice(0, 1).toLocaleUpperCase();
  const preview = availablePreview(currentCharacter);
  $('portrait').classList.toggle('has-image', Boolean(preview));
  $('portrait-image').src = preview;
  $('portrait-image').alt = preview ? `Превью ${currentCharacter.name}` : '';
  $('open-card-editor').textContent = cardDrafts[currentName] ? 'Наборы · локальный черновик' : 'Наборы персонажа';
}

function renderLora() {
  const item = sourceFor(currentCharacter);
  const hasLora = currentCharacter.lora !== 'None';
  const installed = hasLora && loraByName.has(normalizedPath(currentCharacter.lora));
  $('lora-title').textContent = item.title || currentCharacter.name;
  $('lora-path').textContent = hasLora ? currentCharacter.lora : 'В карточке нет LoRA';
  $('lora-enabled').checked = state.loraEnabled && hasLora;
  $('lora-enabled').disabled = !hasLora;
  $('lora-strength').value = state.loraStrength;
  $('lora-strength').disabled = !hasLora;
  $('lora-strength-value').textContent = Number(state.loraStrength).toFixed(2);
  const availability = $('lora-availability');
  availability.textContent = !hasLora ? 'Без модели' : installed ? 'Установлена' : 'Не найдена';
  availability.classList.toggle('missing', hasLora && !installed);
}

function makeChoice(kind, key, text, active) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `choice${active ? ' active' : ''}`;
  button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(active));
  button.textContent = variantLabel(currentCharacter, kind, key);
  const preview = document.createElement('small'); preview.textContent = splitTags(text).slice(0, 3).join(', ') || 'без тегов'; button.append(preview);
  button.addEventListener('click', () => {
    state = selectVariant(state, currentCharacter, kind, key);
    saveCurrentRecipe(); renderRecipe();
  });
  return button;
}

function renderVariants() {
  const appearanceList = $('appearance-choices'); appearanceList.replaceChildren();
  const outfitList = $('outfit-choices'); outfitList.replaceChildren();
  for (const [key, text] of Object.entries(currentCharacter.appearances)) appearanceList.append(makeChoice('appearance', key, text, key === state.appearanceName));
  for (const [key, text] of Object.entries(currentCharacter.outfits)) outfitList.append(makeChoice('outfit', key, text, key === state.outfitName));
  $('appearance-count').textContent = `${Object.keys(currentCharacter.appearances).length} ${Object.keys(currentCharacter.appearances).length === 1 ? 'набор' : 'набора'}`;
  $('outfit-enabled').checked = state.outfitEnabled;
  $('appearance-field-name').textContent = variantLabel(currentCharacter, 'appearance', state.appearanceName);
  $('outfit-field-name').textContent = state.outfitEnabled ? variantLabel(currentCharacter, 'outfit', state.outfitName) : `${variantLabel(currentCharacter, 'outfit', state.outfitName)} · сохранён, выключен`;
  $('outfit-field').classList.toggle('disabled', !state.outfitEnabled);
}

function renderFields() {
  const values = {
    'scene-input': state.scene,
    'trigger-input': state.trigger,
    'appearance-input': state.appearanceEdits[state.appearanceName] || '',
    'outfit-input': state.outfitEdits[state.outfitName] || '',
    'extra-input': state.extra,
  };
  for (const [id, value] of Object.entries(values)) if ($(id).value !== value) $(id).value = value;
}

function combinedAuthorTags() {
  const source = sourceFor(currentCharacter);
  return splitTags([...(source.tags || []), ...(source.triggers || [])]);
}

function currentTargetText() {
  if (tagTarget === 'appearance') return state.appearanceEdits[state.appearanceName] || '';
  if (tagTarget === 'outfit') return state.outfitEdits[state.outfitName] || '';
  return state[tagTarget] || '';
}

function addAuthorTag(tag) {
  const nextText = joinTags([currentTargetText(), tag]);
  if (tagTarget === 'appearance') {
    state = updateRecipe(state, { appearanceEdits: { ...state.appearanceEdits, [state.appearanceName]: nextText } });
  } else if (tagTarget === 'outfit') {
    state = updateRecipe(state, { outfitEdits: { ...state.outfitEdits, [state.outfitName]: nextText } });
  } else state = updateRecipe(state, { [tagTarget]: nextText });
  saveCurrentRecipe(); renderRecipe(); showToast(`Добавлено в секцию «${targetLabel(tagTarget)}»`);
}

function targetLabel(target) {
  return { scene: 'Сцена', appearance: 'Внешность', outfit: 'Одежда', extra: 'Дополнительно' }[target];
}

function renderAuthorTags() {
  const list = $('author-tag-list'); list.replaceChildren();
  const active = new Set(splitTags(currentTargetText()).map((tag) => tag.toLocaleLowerCase()));
  const tags = combinedAuthorTags();
  if (!tags.length) {
    const note = document.createElement('span'); note.className = 'empty-list'; note.textContent = 'В карточке нет подсказок автора'; list.append(note); return;
  }
  for (const tag of tags) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `suggestion${active.has(tag.toLocaleLowerCase()) ? ' used' : ''}`; button.textContent = tag;
    button.title = `Добавить в «${targetLabel(tagTarget)}»`;
    button.addEventListener('click', () => addAuthorTag(tag)); list.append(button);
  }
}

function renderPrompt() {
  const parts = [
    ['Сцена', state.scene, false],
    ['Триггер', state.trigger, false],
    ['Внешность', state.appearanceEdits[state.appearanceName], false],
    ['Одежда', state.outfitEdits[state.outfitName], !state.outfitEnabled],
    ['Доп.', state.extra, false],
  ];
  const container = $('prompt-parts'); container.replaceChildren();
  for (const [label, value, off] of parts) {
    const row = document.createElement('div'); row.className = `prompt-part${off ? ' off' : ''}${!value ? ' empty' : ''}`;
    const dot = document.createElement('i'); const title = document.createElement('b'); title.textContent = label;
    const text = document.createElement('span'); text.textContent = off ? `${value || 'без тегов'} · не включено` : value || 'пусто'; text.title = text.textContent;
    row.append(dot, title, text); container.append(row);
  }
  if ($('final-prompt').value !== state.finalPrompt) $('final-prompt').value = state.finalPrompt;
  const manual = state.finalMode === 'manual';
  $('prompt-status').textContent = manual ? 'Ручная версия' : 'Синхронизирован';
  $('prompt-status').className = `prompt-status ${manual ? 'manual' : 'synced'}`;
  $('manual-notice').hidden = !state.compositionStale;
  const tagCount = splitTags(state.finalPrompt).length;
  $('tag-count').textContent = `${tagCount} ${tagCount % 10 === 1 && tagCount % 100 !== 11 ? 'тег' : tagCount % 10 >= 2 && tagCount % 10 <= 4 && ![12, 13, 14].includes(tagCount % 100) ? 'тега' : 'тегов'}`;
  $('lora-summary').textContent = state.loraEnabled && currentCharacter.lora !== 'None' ? `LoRA ${Number(state.loraStrength).toFixed(2)}` : 'LoRA выключена';
}

function renderRecipe() {
  renderVariants(); renderFields(); renderAuthorTags(); renderLora(); renderPrompt();
}

function renderAll() {
  renderCharacterList(); renderIdentity(); renderRecipe();
}

function editField(field, value) {
  if (field === 'appearance') state = updateRecipe(state, { appearanceEdits: { ...state.appearanceEdits, [state.appearanceName]: value } });
  else if (field === 'outfit') state = updateRecipe(state, { outfitEdits: { ...state.outfitEdits, [state.outfitName]: value } });
  else state = updateRecipe(state, { [field]: value });
  saveCurrentRecipe(); renderPrompt(); renderAuthorTags();
}

function openCardEditor() {
  editorDraft = structuredClone(currentCharacter);
  $('drawer-title').textContent = `Наборы ${currentCharacter.name}`;
  renderCardEditor();
  $('drawer-backdrop').hidden = false;
  $('card-drawer').classList.add('open'); $('card-drawer').setAttribute('aria-hidden', 'false');
}

function closeCardEditor() {
  $('card-drawer').classList.remove('open'); $('card-drawer').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('drawer-backdrop').hidden = true; }, 220);
}

function makeVariantEditor(kind, key, text) {
  const row = document.createElement('div'); row.className = 'variant-editor'; row.dataset.original = key;
  const top = document.createElement('div'); top.className = 'variant-editor-top';
  const name = document.createElement('input'); name.value = key; name.setAttribute('aria-label', 'Название набора');
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-variant'; remove.textContent = '×'; remove.title = 'Удалить набор';
  remove.addEventListener('click', () => {
    const list = row.parentElement;
    if (list.children.length === 1) { showToast('Нужен хотя бы один набор'); return; }
    row.remove();
  });
  const tags = document.createElement('textarea'); tags.value = text; tags.setAttribute('aria-label', 'Теги набора');
  top.append(name, remove); row.append(top, tags); return row;
}

function renderCardEditor() {
  const container = $('card-editor-content'); container.replaceChildren();
  for (const [kind, title, values] of [['appearance', 'Внешность', editorDraft.appearances], ['outfit', 'Одежда', editorDraft.outfits]]) {
    const section = document.createElement('section'); section.className = 'editor-section'; section.dataset.kind = kind;
    const head = document.createElement('div'); head.className = 'editor-section-head';
    const heading = document.createElement('h3'); heading.textContent = title;
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Добавить набор';
    const list = document.createElement('div'); list.className = 'variant-editor-list';
    for (const [key, text] of Object.entries(values)) list.append(makeVariantEditor(kind, key, text));
    add.addEventListener('click', () => {
      let index = list.children.length + 1; let name = `Новый набор ${index}`;
      const names = [...list.querySelectorAll('input')].map((input) => input.value);
      while (names.includes(name)) name = `Новый набор ${++index}`;
      list.append(makeVariantEditor(kind, name, '')); list.lastElementChild.querySelector('input').focus();
    });
    head.append(heading, add); section.append(head, list); container.append(section);
  }
  const source = sourceFor(currentCharacter);
  const sourceSection = document.createElement('section'); sourceSection.className = 'editor-section';
  const sourceHead = document.createElement('div'); sourceHead.className = 'editor-section-head';
  const sourceTitle = document.createElement('h3'); sourceTitle.textContent = 'Что дал автор модели'; sourceHead.append(sourceTitle);
  const sourceCard = document.createElement('div'); sourceCard.className = 'source-card';
  const description = document.createElement('p'); description.textContent = source.description || 'Описание отсутствует';
  const summary = document.createElement('small'); summary.textContent = `${(source.triggers || []).length} подсказки · ${(source.tags || []).length} тегов · источник остаётся без изменений`;
  sourceCard.append(description, summary); sourceSection.append(sourceHead, sourceCard); container.append(sourceSection);
}

function collectCardEditor() {
  const draft = structuredClone(editorDraft);
  for (const section of $('card-editor-content').querySelectorAll('section[data-kind]')) {
    const kind = section.dataset.kind;
    const values = {};
    for (const row of section.querySelectorAll('.variant-editor')) {
      const name = row.querySelector('input').value.trim();
      if (!name) throw new Error('Назовите каждый набор');
      if (Object.hasOwn(values, name)) throw new Error(`Название «${name}» повторяется`);
      values[name] = joinTags(row.querySelector('textarea').value);
    }
    if (kind === 'appearance') {
      draft.appearances = values;
      draft.activeAppearanceName = Object.hasOwn(values, state.appearanceName) ? state.appearanceName : Object.keys(values)[0];
    } else {
      draft.outfits = values;
      draft.activeOutfitName = Object.hasOwn(values, state.outfitName) ? state.outfitName : Object.keys(values)[0];
    }
  }
  return normalizeCharacter(currentName, draft);
}

function saveCardEditor() {
  try { editorDraft = collectCardEditor(); } catch (error) { showToast(error.message); return; }
  cardDrafts[currentName] = editorDraft; writeStore(STORAGE.cards, cardDrafts);
  characters[currentName] = editorDraft;
  const previous = state;
  state = createRecipeState(editorDraft, {
    scene: previous.scene, extra: previous.extra, trigger: previous.trigger,
    appearanceName: editorDraft.activeAppearanceName, outfitName: editorDraft.activeOutfitName,
    appearanceEdits: editorDraft.appearances, outfitEdits: editorDraft.outfits,
    outfitEnabled: previous.outfitEnabled, loraEnabled: previous.loraEnabled, loraStrength: previous.loraStrength,
  });
  recipeDrafts[currentName] = state; saveCurrentRecipe(); renderAll(); closeCardEditor(); showToast('Наборы сохранены в локальный черновик');
}

function discardCardDraft() {
  delete cardDrafts[currentName]; writeStore(STORAGE.cards, cardDrafts);
  characters[currentName] = structuredClone(baseCharacters[currentName]);
  delete recipeDrafts[currentName]; writeStore(STORAGE.recipes, recipeDrafts);
  closeCardEditor(); selectCharacter(currentName, { fresh: true, skipSave: true }); showToast('Возвращены данные Prism');
}

function showRecipe() {
  const item = sourceFor(currentCharacter);
  const rows = [
    ['Персонаж', currentCharacter.name],
    ['LoRA', state.loraEnabled && currentCharacter.lora !== 'None' ? `${currentCharacter.lora} · вес ${Number(state.loraStrength).toFixed(2)}${loraByName.has(normalizedPath(currentCharacter.lora)) ? '' : ' · не найдена'}` : 'Выключена'],
    ['Внешность', variantLabel(currentCharacter, 'appearance', state.appearanceName)],
    ['Одежда', state.outfitEnabled ? variantLabel(currentCharacter, 'outfit', state.outfitName) : `${variantLabel(currentCharacter, 'outfit', state.outfitName)} · сохранена, не включена`],
    ['Промпт', state.finalPrompt || 'Пусто'],
    ['Источник', [item.author, item.base, item.version].filter(Boolean).join(' · ') || 'Нет метаданных'],
  ];
  const sheet = $('recipe-sheet'); sheet.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement('div'); row.className = 'sheet-row';
    const key = document.createElement('b'); key.textContent = label; const text = document.createElement('span'); text.textContent = value;
    row.append(key, text); sheet.append(row);
  }
  $('recipe-dialog').showModal();
}

function resetCurrentRecipe() {
  delete recipeDrafts[currentName]; writeStore(STORAGE.recipes, recipeDrafts);
  selectCharacter(currentName, { fresh: true, skipSave: true }); showToast('Рецепт возвращён к карточке');
}

function bindEvents() {
  $('character-search').addEventListener('input', renderCharacterList);
  $('scene-input').addEventListener('input', (event) => editField('scene', event.target.value));
  $('trigger-input').addEventListener('input', (event) => editField('trigger', event.target.value));
  $('appearance-input').addEventListener('input', (event) => editField('appearance', event.target.value));
  $('outfit-input').addEventListener('input', (event) => editField('outfit', event.target.value));
  $('extra-input').addEventListener('input', (event) => editField('extra', event.target.value));
  $('outfit-enabled').addEventListener('change', (event) => { state = updateRecipe(state, { outfitEnabled: event.target.checked }); saveCurrentRecipe(); renderRecipe(); });
  $('lora-enabled').addEventListener('change', (event) => { state = updateRecipe(state, { loraEnabled: event.target.checked }); saveCurrentRecipe(); renderLora(); renderPrompt(); });
  $('lora-strength').addEventListener('input', (event) => { state = updateRecipe(state, { loraStrength: Number(event.target.value) }); saveCurrentRecipe(); renderLora(); renderPrompt(); });
  $('final-prompt').addEventListener('input', (event) => { state = updateRecipe(state, { finalPrompt: event.target.value }, 'final'); saveCurrentRecipe(); renderPrompt(); });
  $('apply-composition').addEventListener('click', () => { state = applyComposition(state); saveCurrentRecipe(); renderPrompt(); });
  $('reset-recipe').addEventListener('click', resetCurrentRecipe);
  for (const button of document.querySelectorAll('.target-picker button')) button.addEventListener('click', () => {
    tagTarget = button.dataset.target;
    for (const item of document.querySelectorAll('.target-picker button')) item.classList.toggle('active', item === button);
    renderAuthorTags();
  });
  $('open-card-editor').addEventListener('click', openCardEditor);
  $('close-card-editor').addEventListener('click', closeCardEditor);
  $('drawer-backdrop').addEventListener('click', closeCardEditor);
  $('save-card-draft').addEventListener('click', saveCardEditor);
  $('discard-card-draft').addEventListener('click', discardCardDraft);
  $('preview-recipe').addEventListener('click', showRecipe);
  $('copy-recipe').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.finalPrompt); showToast('Промпт скопирован'); } catch { showToast('Не удалось скопировать'); }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('card-drawer').classList.contains('open')) closeCardEditor(); });
}

async function loadData() {
  const [charactersResult, loraResult] = await Promise.allSettled([
    fetch('/prism/characters', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.characters || typeof data.characters !== 'object') throw new Error('неверный формат');
      return data.characters;
    }),
    fetch('/prism/lora-library', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); return Array.isArray(data.items) ? data.items : [];
    }),
  ]);
  baseCharacters = charactersResult.status === 'fulfilled' ? charactersResult.value : FALLBACK_CHARACTERS;
  loraItems = loraResult.status === 'fulfilled' ? loraResult.value : [];
  loraByName = new Map(loraItems.map((item) => [normalizedPath(item.name), item]));
  characters = Object.fromEntries(Object.entries(baseCharacters).map(([name, raw]) => [name, normalizeCharacter(name, cardDrafts[name] || raw)]));
  if (!Object.keys(characters).length) characters = structuredClone(FALLBACK_CHARACTERS);
  const selected = localStorage.getItem(STORAGE.selected);
  const initial = characters.Isabella ? 'Isabella' : characters[selected] ? selected : Object.keys(characters)[0];
  $('loading-panel').hidden = true; $('recipe-content').hidden = false;
  selectCharacter(initial, { skipSave: true });
  if (charactersResult.status === 'rejected') showToast('API недоступен: показана резервная карточка Isabella');
}

bindEvents();
loadData();
