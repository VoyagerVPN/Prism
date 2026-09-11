import { buildPrompt, createSession, parseTags, recipeFromSession, selectVariant, variantLabel } from './recipe.js';

const STORAGE_PREFIX = 'prism-variant3';
const STORAGE_SESSIONS = `${STORAGE_PREFIX}:sessions`;
const STORAGE_CARDS = `${STORAGE_PREFIX}:card-drafts`;
const $ = id => document.getElementById(id);

let originalCharacters = {};
let characters = {};
let loraItems = [];
let sessions = readStorage(STORAGE_SESSIONS, {});
let cardDrafts = readStorage(STORAGE_CARDS, {});
let selectedName = '';
let activeTagKind = 'appearance';

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  const state = $('save-state');
  state.lastChild.textContent = 'Черновик сохранён в браузере';
  clearTimeout(writeStorage.timer);
  writeStorage.timer = setTimeout(() => { state.lastChild.textContent = 'Черновик хранится в браузере'; }, 1300);
}

function normalizePath(value = '') { return value.replaceAll('\\', '/').toLocaleLowerCase(); }

async function load() {
  try {
    const [characterResponse, loraResponse] = await Promise.all([
      fetch('/prism/characters', { cache: 'no-store' }),
      fetch('/prism/lora-library', { cache: 'no-store' }),
    ]);
    if (!characterResponse.ok || !loraResponse.ok) throw new Error('API Prism вернул ошибку');
    const characterData = await characterResponse.json();
    const loraData = await loraResponse.json();
    if (!characterData.characters || !Array.isArray(loraData.items)) throw new Error('Некорректный формат данных');
    originalCharacters = structuredClone(characterData.characters);
    characters = structuredClone(originalCharacters);
    for (const [name, draft] of Object.entries(cardDrafts)) if (characters[name]) characters[name] = draft;
    loraItems = loraData.items;
    const names = Object.keys(characters);
    selectedName = names.includes('Isabella') ? 'Isabella' : names[0];
    $('loading').hidden = true;
    $('workspace').hidden = false;
    bindEvents();
    renderCharacterList();
    chooseCharacter(selectedName);
  } catch (error) {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = `Не удалось открыть мастерскую: ${error.message}. Проверьте, что Prism запущен, и обновите страницу.`;
  }
}

function characterSession(name) {
  const character = characters[name];
  const stored = sessions[name];
  if (!stored || stored.characterName !== name) return createSession(character);
  return { ...createSession(character), ...stored };
}

function saveSession() {
  sessions[selectedName] = session();
  writeStorage(STORAGE_SESSIONS, sessions);
}

function session() { return sessions[selectedName]; }

function chooseCharacter(name) {
  if (!characters[name]) return;
  selectedName = name;
  sessions[name] = characterSession(name);
  renderCharacterList();
  renderWorkspace();
  saveSession();
}

function renderCharacterList() {
  const query = $('character-search').value.trim().toLocaleLowerCase();
  const list = $('character-list');
  list.replaceChildren();
  const entries = Object.entries(characters).filter(([name, character]) => `${name} ${character.universe ?? ''}`.toLocaleLowerCase().includes(query));
  $('character-count').textContent = `${entries.length}`;
  for (const [name, character] of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-button${name === selectedName ? ' active' : ''}`;
    button.dataset.name = name;
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = name.slice(0, 1).toLocaleUpperCase();
    const copy = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = name;
    const detail = document.createElement('small'); detail.textContent = character.universe || character.source?.title || 'Сохранённый персонаж';
    copy.append(title, detail);
    const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓';
    button.append(avatar, copy, check);
    button.addEventListener('click', () => chooseCharacter(name));
    list.append(button);
  }
}

function renderWorkspace() {
  const character = characters[selectedName];
  const current = session();
  renderSelect($('appearance-select'), character, 'appearance', current.appearanceKey);
  renderSelect($('outfit-select'), character, 'outfit', current.outfitKey);
  $('outfit-enabled').checked = current.outfitEnabled;
  $('outfit-inclusion').textContent = current.outfitEnabled
    ? 'Сохранённый комплект включён в итоговый prompt.'
    : 'Комплект сохранён в карточке, но исключён из итогового prompt.';
  $('outfit-inclusion').classList.toggle('included', current.outfitEnabled);
  $('scene').value = current.scene;
  $('lora-enabled').checked = current.loraEnabled;
  $('lora-strength').value = current.strength;
  $('strength-value').textContent = Number(current.strength).toFixed(2);
  renderTags();
  renderAuthorPalette();
  renderSource();
  renderLora();
  renderPrompt();
}

function renderSelect(select, character, kind, selected) {
  const values = kind === 'appearance'
    ? character.appearances ?? { 'По умолчанию': character.appearance ?? '' }
    : character.outfits ?? { 'По умолчанию': character.outfit ?? '' };
  select.replaceChildren();
  for (const key of Object.keys(values)) select.add(new Option(variantLabel(character, kind, key), key));
  select.value = selected;
}

function renderTags() {
  const current = session();
  for (const kind of ['trigger', 'appearance', 'outfit']) {
    const host = $(`${kind}-tags`);
    host.replaceChildren();
    for (const tag of current[`${kind}Tags`]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `tag ${kind}`; button.textContent = tag;
      button.title = 'Удалить из текущего кадра';
      button.addEventListener('click', () => { current[`${kind}Tags`] = current[`${kind}Tags`].filter(item => item !== tag); changed(); });
      host.append(button);
    }
    host.closest('.tag-field').classList.toggle('focused', activeTagKind === kind);
  }
}

function authorTokens(character) {
  const sources = [...(character.source?.triggers ?? []), ...(character.source?.tags ?? [])];
  return parseTags(sources.join(','));
}

function renderAuthorPalette() {
  const host = $('author-tags'); host.replaceChildren();
  const tokens = authorTokens(characters[selectedName]);
  if (!tokens.length) { host.textContent = 'В карточке нет тегов автора'; return; }
  for (const tag of tokens) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'author-tag'; button.textContent = `+ ${tag}`;
    button.title = `Добавить в поле «${kindTitle(activeTagKind)}»`;
    button.addEventListener('click', () => {
      const key = `${activeTagKind}Tags`;
      session()[key] = parseTags([...session()[key], tag].join(','));
      changed();
    });
    host.append(button);
  }
}

function kindTitle(kind) { return ({ trigger: 'Триггер', appearance: 'Внешность', outfit: 'Одежда' })[kind]; }

function renderSource() {
  const source = characters[selectedName].source ?? {};
  const host = $('source-card'); host.replaceChildren();
  const title = document.createElement('strong'); title.textContent = source.title || 'Локальная карточка'; host.append(title);
  const meta = document.createElement('span'); meta.textContent = [source.author && `Автор: ${source.author}`, source.base, source.version].filter(Boolean).join(' · ') || 'Без метаданных автора'; host.append(meta);
  if (source.url) { host.append(document.createElement('br')); const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Открыть источник ↗'; host.append(link); }
}

function renderLora() {
  const current = session();
  const item = loraItems.find(entry => normalizePath(entry.name) === normalizePath(current.lora));
  $('lora-title').textContent = item?.title || (current.lora === 'None' ? 'Не назначена' : current.lora.split(/[\\/]/).at(-1));
  $('lora-path').textContent = current.lora;
  $('lora-path').title = current.lora;
  $('lora-status').classList.toggle('missing', current.lora !== 'None' && !item);
  $('lora-status').textContent = current.lora === 'None' ? 'В карточке нет LoRA' : item ? 'Доступна в локальной библиотеке' : 'Файл не найден в локальной библиотеке';
  $('lora-strength').disabled = !current.loraEnabled || current.lora === 'None';
}

function renderPrompt() {
  const current = session();
  const custom = current.promptMode === 'custom';
  $('prompt-segments').hidden = custom;
  $('final-prompt').hidden = !custom;
  $('custom-notice').hidden = !custom;
  $('edit-final').textContent = custom ? 'Редактируется вручную' : 'Редактировать целиком';
  if (custom) $('final-prompt').value = current.customPrompt;
  else {
    const host = $('prompt-segments'); host.replaceChildren();
    const groups = [
      ['trigger', current.triggerTags], ['appearance', current.appearanceTags],
      ['outfit', current.outfitEnabled ? current.outfitTags : []], ['scene', parseTags(current.scene)],
    ];
    const populated = groups.filter(([, tags]) => tags.length);
    populated.forEach(([kind, tags], groupIndex) => tags.forEach((tag, index) => {
      const span = document.createElement('span'); span.className = `segment ${kind}`; span.textContent = tag;
      host.append(span);
      if (index < tags.length - 1 || groupIndex < populated.length - 1) host.append(document.createTextNode(', '));
    }));
    if (!host.childNodes.length) host.textContent = 'Добавьте теги слева — здесь появится prompt.';
  }
  const recipe = recipeFromSession(current);
  $('tag-count').textContent = parseTags(recipe.prompt).length;
  $('lora-count').textContent = recipe.loras.length;
}

function changed() {
  $('outfit-inclusion').textContent = session().outfitEnabled
    ? 'Сохранённый комплект включён в итоговый prompt.'
    : 'Комплект сохранён в карточке, но исключён из итогового prompt.';
  $('outfit-inclusion').classList.toggle('included', session().outfitEnabled);
  renderTags(); renderAuthorPalette(); renderLora(); renderPrompt(); saveSession();
}

function addFromInput(kind, input) {
  const value = input.value.trim(); if (!value) return;
  const key = `${kind}Tags`; session()[key] = parseTags([...session()[key], value].join(','));
  input.value = ''; changed();
}

function saveVariant(kind) {
  const requested = $('variant-name').value.trim();
  if (!requested) { $('variant-name').focus(); return; }
  const character = characters[selectedName];
  const valuesKey = kind === 'appearance' ? 'appearances' : 'outfits';
  character[valuesKey] ??= {};
  let key = requested; let index = 2;
  while (Object.hasOwn(character[valuesKey], key)) key = `${requested} ${index++}`;
  character[valuesKey][key] = session()[`${kind}Tags`].join(', ');
  character.variantNames ??= {}; character.variantNames[kind] ??= {}; character.variantNames[kind][key] = requested;
  session()[`${kind}Key`] = key;
  cardDrafts[selectedName] = structuredClone(character);
  writeStorage(STORAGE_CARDS, cardDrafts);
  $('variant-name').value = '';
  renderWorkspace(); saveSession();
}

function discardCardDraft() {
  delete cardDrafts[selectedName]; writeStorage(STORAGE_CARDS, cardDrafts);
  characters[selectedName] = structuredClone(originalCharacters[selectedName]);
  sessions[selectedName] = createSession(characters[selectedName]);
  renderWorkspace(); saveSession();
}

function showRecipe() {
  const recipe = recipeFromSession(session());
  const summary = $('recipe-summary'); summary.replaceChildren();
  const grid = document.createElement('div'); grid.className = 'summary-grid';
  for (const [label, value] of [['Персонаж', recipe.character], ['Режим prompt', recipe.promptMode === 'custom' ? 'Ручной' : 'Собран из полей'], ['Тегов', parseTags(recipe.prompt).length], ['LoRA', recipe.loras.length ? `${recipe.loras[0].strength.toFixed(2)} · подключена` : 'Не подключена']]) {
    const cell = document.createElement('div'); const caption = document.createElement('span'); caption.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; cell.append(caption, strong); grid.append(cell);
  }
  summary.append(grid); $('recipe-json').value = JSON.stringify(recipe, null, 2); $('recipe-dialog').showModal();
}

function bindEvents() {
  $('character-search').addEventListener('input', renderCharacterList);
  $('appearance-select').addEventListener('change', event => { selectVariant(session(), characters[selectedName], 'appearance', event.target.value); changed(); });
  $('outfit-select').addEventListener('change', event => { selectVariant(session(), characters[selectedName], 'outfit', event.target.value); changed(); });
  $('outfit-enabled').addEventListener('change', event => { session().outfitEnabled = event.target.checked; changed(); });
  $('scene').addEventListener('input', event => { session().scene = event.target.value; renderPrompt(); saveSession(); });
  $('lora-enabled').addEventListener('change', event => { session().loraEnabled = event.target.checked; changed(); });
  $('lora-strength').addEventListener('input', event => { session().strength = Number(event.target.value); $('strength-value').textContent = session().strength.toFixed(2); renderPrompt(); saveSession(); });
  for (const kind of ['trigger', 'appearance', 'outfit']) {
    const field = document.querySelector(`[data-kind="${kind}"]`);
    field.addEventListener('pointerdown', () => { activeTagKind = kind; renderTags(); renderAuthorPalette(); $('palette-hint').textContent = `добавляем в «${kindTitle(kind)}»`; });
    const input = $(`${kind}-input`);
    input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addFromInput(kind, input); } });
    input.addEventListener('blur', () => addFromInput(kind, input));
  }
  $('reset-session').addEventListener('click', () => { sessions[selectedName] = createSession(characters[selectedName]); renderWorkspace(); saveSession(); });
  $('edit-final').addEventListener('click', () => { if (session().promptMode !== 'custom') { session().customPrompt = buildPrompt(session()); session().promptMode = 'custom'; changed(); $('final-prompt').focus(); } });
  $('final-prompt').addEventListener('input', event => { session().customPrompt = event.target.value; $('tag-count').textContent = parseTags(event.target.value).length; saveSession(); });
  $('reassemble').addEventListener('click', () => { session().promptMode = 'assembled'; changed(); });
  $('save-appearance').addEventListener('click', () => saveVariant('appearance'));
  $('save-outfit').addEventListener('click', () => saveVariant('outfit'));
  $('discard-card-draft').addEventListener('click', discardCardDraft);
  $('review-recipe').addEventListener('click', showRecipe);
  $('copy-recipe').addEventListener('click', async () => { await navigator.clipboard.writeText($('recipe-json').value); $('copy-recipe').textContent = 'Скопировано ✓'; setTimeout(() => { $('copy-recipe').textContent = 'Копировать JSON'; }, 1300); });
}

load();
