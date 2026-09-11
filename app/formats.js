import {widthSlider, heightSlider, widthVal, heightVal} from './elements.js';
import {activeWidth, activeHeight, setActiveWidth, setActiveHeight} from './state.js';
import {askConfirm, showNotice} from './dialogs.js';
import {makeDialogBackdropDismissible} from './popup_behavior.js';

const key = 'prism_image_formats';
const grid = document.querySelector('.resolution-grid');
let formats = [];

function ratio(width, height) {
  let a = width, b = height;
  while (b) [a,b] = [b,a % b];
  return `${width/a}:${height/a}`;
}

function validSize(value) {
  return Number.isInteger(value) && value >= 256 && value <= 2048 && value % 8 === 0;
}

export function syncImageFormats() {
  widthVal.value = activeWidth;
  heightVal.value = activeHeight;
  widthVal.setCustomValidity('');
  heightVal.setCustomValidity('');
  for (const button of grid.querySelectorAll('.res-btn')) {
    const active = Number(button.dataset.width) === activeWidth && Number(button.dataset.height) === activeHeight;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const pixelCount = new Intl.NumberFormat('ru-RU').format(activeWidth * activeHeight);
  document.getElementById('current-format-ratio').textContent = `${ratio(activeWidth,activeHeight)} · ${activeWidth} × ${activeHeight} px · ${pixelCount} пикс.`;
}

function renderFormats() {
  grid.replaceChildren();
  for (const format of formats) {
    const tile = document.createElement('div');
    tile.className = 'format-tile';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'res-btn';
    button.dataset.width = format.width;
    button.dataset.height = format.height;
    button.title = `${format.name} — ${format.width} × ${format.height} px`;
    button.setAttribute('aria-label',button.title);
    const shape = document.createElement('span');
    shape.className = 'ratio-shape';
    shape.setAttribute('aria-hidden','true');
    const longest = Math.max(format.width,format.height);
    shape.style.width = `${24 * format.width / longest}px`;
    shape.style.height = `${24 * format.height / longest}px`;
    const label = document.createElement('span');
    label.className = 'format-name';
    label.textContent = format.name;
    label.hidden = format.name === ratio(format.width,format.height);
    const dimensions = document.createElement('span');
    dimensions.textContent = ratio(format.width,format.height);
    button.append(shape,label,dimensions);
    tile.append(button);
    for (const [action,icon,title] of [['edit','edit','Редактировать'],['delete','delete','Удалить']]) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = `format-action format-${action}`;
      control.title = `${title} формат «${format.name}»`;
      control.setAttribute('aria-label',control.title);
      control.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg>`;
      control.onclick = async () => {
        if (action === 'edit') editFormat(format);
        else if (await askConfirm(`Удалить формат «${format.name}» (${format.width} × ${format.height} px)?`)) {
          if (await persistFormats(formats.filter(item => item !== format))) document.getElementById('add-format-btn').focus();
        }
      };
      tile.append(control);
    }
    grid.append(tile);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.id = 'add-format-btn';
  add.className = 'format-add';
  add.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-plus"/></svg>';
  add.title = 'Добавить формат';
  add.setAttribute('aria-label','Добавить формат');
  add.onclick = () => editFormat();
  grid.append(add);
  syncImageFormats();
}

async function persistFormats(next) {
  try { localStorage.setItem(key,JSON.stringify(next)); }
  catch { await showNotice('Не удалось сохранить форматы в браузере. Освободите место и повторите.'); return false; }
  formats = next;
  renderFormats();
  return true;
}

function editFormat(existing) {
  let dialog = document.getElementById('format-editor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'format-editor';
    dialog.className = 'app-dialog';
    dialog.setAttribute('aria-labelledby','format-editor-title');
    dialog.innerHTML = '<form><h2 id="format-editor-title"></h2><label>Название<input name="name" type="text" maxlength="80" required></label><div class="grid-2-col"><label>Ширина, px<input name="width" type="number" min="256" max="2048" step="8" required></label><label>Высота, px<input name="height" type="number" min="256" max="2048" step="8" required></label></div><p role="status"></p><div class="dialog-actions"><button type="button" data-cancel>Отмена</button><button type="submit" class="dialog-primary">Сохранить</button></div></form>';
    document.body.append(dialog);
    makeDialogBackdropDismissible(dialog);
  }
  const form = dialog.querySelector('form');
  const fields = form.elements;
  dialog.querySelector('h2').textContent = existing ? 'Редактировать формат' : 'Новый формат';
  fields.name.value = existing?.name ?? `${activeWidth} × ${activeHeight}`;
  fields.width.value = existing?.width ?? activeWidth;
  fields.height.value = existing?.height ?? activeHeight;
  const status = dialog.querySelector('[role=status]');
  const preview = () => {
    const width = Number(fields.width.value), height = Number(fields.height.value);
    status.textContent = validSize(width) && validSize(height) ? `${ratio(width,height)} · ${width} × ${height} px` : '256–2048 px, кратно 8';
  };
  form.oninput = preview;
  preview();
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  form.onsubmit = async event => {
    event.preventDefault();
    const name = fields.name.value.trim(), width = Number(fields.width.value), height = Number(fields.height.value);
    if (!name || name.length > 80 || !validSize(width) || !validSize(height)) { status.textContent = 'Укажите название и размеры 256–2048 px, кратно 8.'; return; }
    if (formats.some(item => item !== existing && item.width === width && item.height === height)) { status.textContent = 'Формат с такими размерами уже есть.'; return; }
    const next = {name,width,height};
    const wasActive = existing && existing.width === activeWidth && existing.height === activeHeight;
    if (!await persistFormats(existing ? formats.map(item => item === existing ? next : item) : [...formats,next])) return;
    if (wasActive) {
      setActiveWidth(width); setActiveHeight(height);
      widthSlider.value = width; heightSlider.value = height;
      syncImageFormats();
      window.dispatchEvent(new CustomEvent('save-settings'));
    }
    dialog.close();
    grid.querySelector(`.res-btn[data-width="${width}"][data-height="${height}"]`).focus();
  };
  dialog.showModal();
  fields.name.focus();
  fields.name.select();
}

export function initImageFormats() {
  formats = [...grid.querySelectorAll('.res-btn')].map(button => ({name:button.textContent.trim(),width:Number(button.dataset.width),height:Number(button.dataset.height)}));
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || !saved.every(format => format && typeof format.name === 'string' && format.name.trim().length > 0 && format.name.length <= 80 && validSize(format.width) && validSize(format.height))) throw new Error('invalid');
      formats = saved;
    }
  } catch {
    // Повреждённую запись не перезаписываем без действия пользователя.
    void showNotice('Список форматов не удалось прочитать. Показаны исходные форматы; сохранение или удаление заменит список в браузере.');
  }
  grid.addEventListener('click',event => {
    const button = event.target.closest('.res-btn');
    if (!button) return;
    setActiveWidth(Number(button.dataset.width));
    setActiveHeight(Number(button.dataset.height));
    widthSlider.value = activeWidth;
    heightSlider.value = activeHeight;
    syncImageFormats();
    window.dispatchEvent(new CustomEvent('save-settings'));
  });
  for (const [slider,input,setter] of [[widthSlider,widthVal,setActiveWidth],[heightSlider,heightVal,setActiveHeight]]) {
    slider.addEventListener('input',() => { setter(Number(slider.value)); syncImageFormats(); });
    slider.addEventListener('change',() => window.dispatchEvent(new CustomEvent('save-settings')));
    input.addEventListener('input',() => input.setCustomValidity(''));
    input.addEventListener('change',() => {
      const value = Number(input.value);
      if (!validSize(value)) {
        input.setCustomValidity('Введите от 256 до 2048 пикселей, кратно 8.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      slider.value = value;
      setter(value);
      syncImageFormats();
      window.dispatchEvent(new CustomEvent('save-settings'));
    });
  }
  renderFormats();
}
