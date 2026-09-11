import {makeDialogBackdropDismissible} from './popup_behavior.js';

let queue = Promise.resolve();

function openDialog(message, {kind, value = '', title, action, readOnly = false}) {
  const result = queue.then(() => new Promise(resolve => {
    let dialog = document.getElementById('action-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'action-dialog';
      dialog.className = 'app-dialog';
      dialog.setAttribute('aria-labelledby', 'action-title');
      dialog.setAttribute('aria-describedby', 'action-message');
      dialog.innerHTML = '<form><h2 id="action-title"></h2><p id="action-message"></p><input id="action-input" type="text"><div class="dialog-actions"><button type="button" data-cancel>Отмена</button><button type="submit" class="dialog-primary"></button></div></form>';
      document.body.append(dialog);
      makeDialogBackdropDismissible(dialog);
    }
    const field = dialog.querySelector('input');
    const cancel = dialog.querySelector('[data-cancel]');
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('p').textContent = message;
    dialog.querySelector('[type=submit]').textContent = action;
    field.hidden = kind !== 'text';
    field.required = kind === 'text';
    field.readOnly = readOnly;
    field.value = value;
    field.setAttribute('aria-label', message);
    cancel.hidden = kind === 'notice';
    const finish = value => { dialog.close(); resolve(value); };
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      if (kind === 'text' && !field.value.trim()) { field.focus(); return; }
      finish(kind === 'text' ? field.value.trim() : true);
    };
    cancel.onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal();
    if (kind === 'text') { field.focus(); field.select(); }
    else if (kind === 'confirm') cancel.focus();
  }));
  queue = result.then(() => undefined, () => undefined);
  return result;
}

export function askText(message, value = '', options = {}) {
  return openDialog(message, {kind:'text', value, title:'Название', action:'Сохранить', ...options});
}

export async function askConfirm(message) {
  return await openDialog(message, {kind:'confirm', title:'Подтверждение', action:'Удалить'}) === true;
}

export function showNotice(message) {
  return openDialog(message, {kind:'notice', title:'Сообщение', action:'Понятно'});
}
