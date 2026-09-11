import { buildPrompt, normalizeCharacter, selectVariant, splitAuthorTags } from './recipe.js';

const $ = selector => document.querySelector(selector);
const STORAGE_PREFIX = 'prism-variant2';
const draftKey = name => `${STORAGE_PREFIX}:draft:${encodeURIComponent(name)}`;

const state = {
  characters: {},
  loras: [],
  selectedName: '',
  character: null,
  scene: '',
  extra: '',
  finalPrompt: '',
  manualPrompt: false,
  loraEnabled: false,
  tagTarget: 'appearance',
  pendingVariantKind: null,
  saveTimer: null,
};

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
}

function countTags(value) {
  return value.split(',').map(tag => tag.trim()).filter(Boolean).length;
}

function optionLabel(character, kind, key) {
  const values = kind === 'appearance' ? character.appearances : character.outfits;
  const named = character.variantNames?.[kind];
  if (named && Object.hasOwn(named, key)) {
    return named[key] || `Без названия · ${Object.keys(values).indexOf(key) + 1}`;
  }
  return key || `Без названия · ${Object.keys(values).indexOf(key) + 1}`;
}

function loadDraft(name) {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(name)) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function queueSave() {
  clearTimeout(state.saveTimer);
  $('#storage-state').lastChild.textContent = ' Сохраняем…';
  state.saveTimer = setTimeout(() => {
    if (!state.character) return;
    localStorage.setItem(draftKey(state.selectedName), JSON.stringify({
      character: state.character,
      scene: state.scene,
      extra: state.extra,
      finalPrompt: state.finalPrompt,
      manualPrompt: state.manualPrompt,
      loraEnabled: state.loraEnabled,
    }));
    $('#storage-state').lastChild.textContent = ' Сохранено локально';
    $('#draft-badge').hidden = false;
  }, 180);
}

function setOptions(select, values, active, character, kind) {
  select.replaceChildren(...Object.keys(values).map(key => {
    const option = new Option(optionLabel(character, kind, key), key);
    option.selected = key === active;
    return option;
  }));
}

function findLora() {
  if (!state.character || state.character.lora === 'None') return null;
  const wanted = state.character.lora.replaceAll('\\', '/');
  return state.loras.find(item => String(item.name).replaceAll('\\', '/') === wanted) ?? null;
}

function layerData() {
  const character = state.character;
  return [
    { name: 'Сцена', value: state.scene, enabled: Boolean(state.scene.trim()) },
    { name: 'Триггер персонажа', value: character.trigger, enabled: Boolean(character.trigger) },
    { name: `Внешность · ${optionLabel(character, 'appearance', character.activeAppearanceName)}`, value: character.appearances[character.activeAppearanceName], enabled: true },
    { name: `Одежда · ${optionLabel(character, 'outfit', character.activeOutfitName)}`, value: character.outfits[character.activeOutfitName], enabled: character.outfitEnabled, reason: character.outfitEnabled ? '' : 'выключено переключателем' },
    { name: 'Дополнительно', value: state.extra, enabled: Boolean(state.extra.trim()) },
  ];
}

function renderLayers() {
  const root = $('#layer-list');
  root.replaceChildren(...layerData().map((layer, index) => {
    const row = document.createElement('div');
    row.className = `layer${layer.enabled ? '' : ' disabled'}`;
    const number = document.createElement('span');
    number.className = 'layer-num';
    number.textContent = String(index + 1).padStart(2, '0');
    const content = document.createElement('div');
    content.className = 'layer-content';
    const title = document.createElement('span');
    title.textContent = layer.name;
    const value = document.createElement('p');
    value.textContent = layer.value?.trim() || 'Пусто';
    content.append(title, value);
    const status = document.createElement('span');
    status.className = 'layer-state';
    status.textContent = layer.enabled ? '✓' : layer.reason || '—';
    if (!layer.enabled && layer.reason) status.title = 'Сохранённые теги остаются в карточке, но не войдут в промпт';
    row.append(number, content, status);
    return row;
  }));
}

function updatePrompt({ save = true } = {}) {
  renderLayers();
  if (!state.manualPrompt) state.finalPrompt = buildPrompt({ scene: state.scene, character: state.character, extra: state.extra });
  $('#final-prompt').value = state.finalPrompt;
  $('#final-prompt').classList.toggle('manual', state.manualPrompt);
  $('#prompt-mode').classList.toggle('manual', state.manualPrompt);
  $('#prompt-mode').textContent = state.manualPrompt
    ? 'Ручная версия сохранена. Изменения слоёв не перезаписывают её.'
    : 'Обновляется из слоёв выше';
  $('#sync-prompt').hidden = !state.manualPrompt;
  renderSourceTags();
  if (save) queueSave();
}

function renderVariantFields() {
  const character = state.character;
  setOptions($('#appearance-select'), character.appearances, character.activeAppearanceName, character, 'appearance');
  setOptions($('#outfit-select'), character.outfits, character.activeOutfitName, character, 'outfit');
  $('#appearance-input').value = character.appearances[character.activeAppearanceName] ?? '';
  $('#outfit-input').value = character.outfits[character.activeOutfitName] ?? '';
  $('#appearance-summary').textContent = optionLabel(character, 'appearance', character.activeAppearanceName);
  $('#outfit-summary').textContent = optionLabel(character, 'outfit', character.activeOutfitName);
  $('#appearance-count').textContent = `${countTags($('#appearance-input').value)} тегов`;
  $('#outfit-count').textContent = `${countTags($('#outfit-input').value)} тегов`;
  $('#outfit-enabled').checked = character.outfitEnabled;
  $('#link-variants').checked = character.variantsLinked;
}

function renderLora() {
  const character = state.character;
  const item = findLora();
  const noLora = character.lora === 'None';
  $('#lora-title').textContent = noLora ? 'Без LoRA' : item?.title || character.source?.title || character.lora.split(/[\\/]/).at(-1);
  $('#lora-path').textContent = character.lora;
  $('#lora-enabled').checked = state.loraEnabled && !noLora;
  $('#lora-enabled').disabled = noLora;
  $('#lora-strength').value = String(character.strength);
  $('#lora-strength').disabled = noLora || !state.loraEnabled;
  $('#lora-strength-value').textContent = Number(character.strength).toFixed(2);
  $('#lora-status').textContent = noLora ? 'Карточка не требует весов' : item ? '✓ Файл найден в библиотеке' : 'Файл не найден в текущей библиотеке';
  $('#lora-status').style.color = noLora || item ? '' : '#e49a86';
}

function currentTagValues() {
  return [
    state.character.trigger,
    ...Object.values(state.character.appearances),
    ...Object.values(state.character.outfits),
    state.extra,
  ].join(',').toLocaleLowerCase();
}

function renderSourceTags() {
  if (!state.character) return;
  const root = $('#source-tags');
  const libraryItem = findLora();
  const tags = splitAuthorTags({
    ...state.character.source,
    triggers: [
      ...(Array.isArray(state.character.source?.triggers) ? state.character.source.triggers : []),
      ...(Array.isArray(libraryItem?.triggers) ? libraryItem.triggers : []),
    ],
    tags: [
      ...(Array.isArray(state.character.source?.tags) ? state.character.source.tags : []),
      ...(Array.isArray(libraryItem?.tags) ? libraryItem.tags : []),
    ],
  });
  const used = currentTagValues();
  root.replaceChildren(...tags.map(tag => {
    const button = document.createElement('button');
    button.className = `chip${used.includes(tag.toLocaleLowerCase()) ? ' used' : ''}`;
    button.type = 'button';
    button.textContent = tag;
    button.title = `Добавить в: ${state.tagTarget === 'appearance' ? 'внешность' : state.tagTarget === 'outfit' ? 'одежду' : 'дополнительно'}`;
    button.addEventListener('click', () => addAuthorTag(tag));
    return button;
  }));
  if (!tags.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'Автор не указал теги для этой LoRA';
    root.append(empty);
  }
}

function appendTag(value, tag) {
  const tags = value.split(',').map(item => item.trim()).filter(Boolean);
  if (!tags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
  return tags.join(', ');
}

function addAuthorTag(tag) {
  const character = state.character;
  if (state.tagTarget === 'appearance') {
    const key = character.activeAppearanceName;
    character.appearances[key] = appendTag(character.appearances[key] ?? '', tag);
    character.appearance = character.appearances[key];
  } else if (state.tagTarget === 'outfit') {
    const key = character.activeOutfitName;
    character.outfits[key] = appendTag(character.outfits[key] ?? '', tag);
  } else {
    state.extra = appendTag(state.extra, tag);
    $('#extra-input').value = state.extra;
  }
  renderVariantFields();
  updatePrompt();
  toast(`Добавлено: ${tag}`);
}

function renderIdentity() {
  const character = state.character;
  $('#editor-title').textContent = character.name;
  $('#universe').textContent = character.universe || 'Без вселенной';
  $('#avatar').textContent = initials(character.name);
  $('#author').textContent = character.source?.author ? `LoRA от ${character.source.author}` : 'Карточка Prism';
  const link = $('#source-link');
  const validSource = /^https?:\/\//.test(character.source?.url ?? '');
  link.hidden = !validSource;
  if (validSource) link.href = character.source.url;
}

function renderCharacterList(filter = '') {
  const root = $('#character-list');
  const needle = filter.trim().toLocaleLowerCase('ru');
  const entries = Object.entries(state.characters).filter(([name, character]) =>
    `${name} ${character.universe ?? ''}`.toLocaleLowerCase('ru').includes(needle));
  $('#character-count').textContent = String(Object.keys(state.characters).length);
  root.replaceChildren(...entries.map(([name, character]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-item${name === state.selectedName ? ' selected' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(name === state.selectedName));
    const avatar = document.createElement('span');
    avatar.className = 'mini-avatar';
    avatar.textContent = initials(name);
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = name;
    const meta = document.createElement('span');
    meta.textContent = character.universe || 'Без вселенной';
    text.append(title, meta);
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = name === state.selectedName ? '›' : '';
    button.append(avatar, text, chevron);
    button.addEventListener('click', () => selectCharacter(name));
    return button;
  }));
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Ничего не найдено';
    root.append(empty);
  }
}

function selectCharacter(name) {
  const source = state.characters[name];
  if (!source) return;
  state.selectedName = name;
  const draft = loadDraft(name);
  state.character = normalizeCharacter(draft?.character ?? { ...source, name: source.name || name });
  state.scene = draft?.scene ?? '';
  state.extra = draft?.extra ?? '';
  state.manualPrompt = draft?.manualPrompt === true;
  state.finalPrompt = state.manualPrompt ? draft.finalPrompt ?? '' : buildPrompt({ scene: state.scene, character: state.character, extra: state.extra });
  state.loraEnabled = draft?.loraEnabled ?? state.character.lora !== 'None';
  $('#scene-input').value = state.scene;
  $('#extra-input').value = state.extra;
  $('#draft-badge').hidden = !draft;
  renderIdentity();
  renderVariantFields();
  renderLora();
  renderCharacterList($('#character-search').value);
  updatePrompt({ save: false });
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 1800);
}

function showRecipe() {
  const character = state.character;
  const item = findLora();
  const rows = [
    ['Персонаж', `${character.name}${character.universe ? ` · ${character.universe}` : ''}`],
    ['Итоговый промпт', state.finalPrompt || 'Пусто'],
    ['LoRA', state.loraEnabled && character.lora !== 'None' ? `${item?.title || character.lora}\n${character.lora} · вес ${Number(character.strength).toFixed(2)}` : 'Не используется'],
    ['Источник тегов', character.source?.author ? `${character.source.author} · теги разобраны из карточки` : 'Пользовательские теги'],
  ];
  const root = $('#recipe-preview');
  root.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const title = document.createElement('span');
    title.textContent = label;
    const body = document.createElement(label === 'Итоговый промпт' || label === 'LoRA' ? 'code' : 'p');
    body.textContent = value;
    row.append(title, body);
    return row;
  }));
  $('#recipe-dialog').showModal();
}

function openVariantDialog(kind) {
  state.pendingVariantKind = kind;
  $('#variant-dialog-title').textContent = kind === 'appearance' ? 'Сохранить внешность' : 'Сохранить комплект';
  $('#variant-name').value = '';
  $('#variant-name').placeholder = kind === 'appearance' ? 'Например, С бантом' : 'Например, Вечерний';
  $('#variant-dialog').showModal();
  $('#variant-name').focus();
}

function bindEvents() {
  $('#character-search').addEventListener('input', event => renderCharacterList(event.target.value));
  $('#scene-input').addEventListener('input', event => { state.scene = event.target.value; updatePrompt(); });
  $('#extra-input').addEventListener('input', event => { state.extra = event.target.value; updatePrompt(); });
  $('#appearance-input').addEventListener('input', event => {
    const key = state.character.activeAppearanceName;
    state.character.appearances[key] = event.target.value;
    state.character.appearance = event.target.value;
    $('#appearance-count').textContent = `${countTags(event.target.value)} тегов`;
    updatePrompt();
  });
  $('#outfit-input').addEventListener('input', event => {
    state.character.outfits[state.character.activeOutfitName] = event.target.value;
    $('#outfit-count').textContent = `${countTags(event.target.value)} тегов`;
    updatePrompt();
  });
  $('#appearance-select').addEventListener('change', event => {
    selectVariant(state.character, 'appearance', event.target.value);
    renderVariantFields();
    updatePrompt();
  });
  $('#outfit-select').addEventListener('change', event => {
    selectVariant(state.character, 'outfit', event.target.value);
    renderVariantFields();
    updatePrompt();
  });
  $('#outfit-enabled').addEventListener('change', event => { state.character.outfitEnabled = event.target.checked; updatePrompt(); });
  $('#link-variants').addEventListener('change', event => { state.character.variantsLinked = event.target.checked; queueSave(); });
  $('#lora-enabled').addEventListener('change', event => { state.loraEnabled = event.target.checked; renderLora(); queueSave(); });
  $('#lora-strength').addEventListener('input', event => {
    state.character.strength = Number(event.target.value);
    $('#lora-strength-value').textContent = state.character.strength.toFixed(2);
    queueSave();
  });
  $('#final-prompt').addEventListener('input', event => {
    state.manualPrompt = true;
    state.finalPrompt = event.target.value;
    updatePrompt();
  });
  $('#sync-prompt').addEventListener('click', () => { state.manualPrompt = false; updatePrompt(); toast('Промпт снова связан со слоями'); });
  document.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => {
    state.tagTarget = button.dataset.target;
    document.querySelectorAll('[data-target]').forEach(item => item.classList.toggle('active', item === button));
    renderSourceTags();
  }));
  document.querySelectorAll('[data-save-variant]').forEach(button => button.addEventListener('click', () => openVariantDialog(button.dataset.saveVariant)));
  $('#variant-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#variant-name').value.trim();
    if (!name) return;
    const kind = state.pendingVariantKind;
    const values = kind === 'appearance' ? state.character.appearances : state.character.outfits;
    const current = kind === 'appearance' ? state.character.activeAppearanceName : state.character.activeOutfitName;
    values[name] = values[current];
    if (kind === 'appearance') {
      state.character.activeAppearanceName = name;
      state.character.appearance = values[name];
    } else state.character.activeOutfitName = name;
    $('#variant-dialog').close();
    renderVariantFields();
    updatePrompt();
    toast(`Вариант «${name}» сохранён локально`);
  });
  $('#reset-draft').addEventListener('click', () => {
    clearTimeout(state.saveTimer);
    localStorage.removeItem(draftKey(state.selectedName));
    selectCharacter(state.selectedName);
    $('#storage-state').lastChild.textContent = ' Локальный черновик';
    toast('Правки сброшены до карточки Prism');
  });
  $('#open-recipe').addEventListener('click', showRecipe);
  $('#open-recipe-bottom').addEventListener('click', showRecipe);
  $('#close-recipe').addEventListener('click', () => $('#recipe-dialog').close());
  $('#back-to-editor').addEventListener('click', () => $('#recipe-dialog').close());
  $('#copy-recipe').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.finalPrompt); toast('Промпт скопирован'); }
    catch { toast('Не удалось скопировать'); }
  });
}

async function init() {
  bindEvents();
  try {
    const [characterResponse, loraResponse] = await Promise.all([
      fetch('/prism/characters', { cache: 'no-store' }),
      fetch('/prism/lora-library', { cache: 'no-store' }),
    ]);
    if (!characterResponse.ok) throw new Error(`персонажи: HTTP ${characterResponse.status}`);
    const characterData = await characterResponse.json();
    state.characters = characterData.characters ?? {};
    if (loraResponse.ok) state.loras = (await loraResponse.json()).items ?? [];
    const names = Object.keys(state.characters);
    if (!names.length) throw new Error('в библиотеке нет персонажей');
    selectCharacter(names.includes('Isabella') ? 'Isabella' : names[0]);
  } catch (error) {
    $('#editor-title').textContent = 'Данные недоступны';
    $('#character-list').replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty';
    message.textContent = `${error.message}. Проверьте proxy Prism.`;
    $('#character-list').append(message);
    $('.editor').inert = true;
    $('.recipe').inert = true;
  }
}

init();
