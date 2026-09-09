// Запустить на загруженной панели; после проверки перезагрузить вкладку.
(async () => {
  const {readSettings, applySettings} = await import('./storage.js');
  const original = readSettings();
  const key = 'prism_image_formats';
  const stored = localStorage.getItem(key);
  const until = async predicate => {
    for (let n = 0; n < 100; n++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Изменение формата не завершилось');
  };
  try {
    document.querySelector('[data-mobile-panel=settings]').click();
    document.querySelector('#settings-tab-image').click();
    const save = document.querySelector('#add-format-btn');
    if (!save) throw new Error('Нельзя сохранить собственный формат');
    for (const [id,value] of [['width-val','1600'],['height-val','960']]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    save.click();
    await until(() => document.querySelector('#format-editor')?.open);
    const editor = document.querySelector('#format-editor');
    editor.querySelector('[name=name]').value = '__Формат проверки__';
    editor.querySelector('[type=submit]').click();
    let expectedHeight = 960;
    const button = () => document.querySelector(`.res-btn[data-width="1600"][data-height="${expectedHeight}"]`);
    await until(button);
    if (!button().textContent.includes('5:3')) throw new Error('Неверное соотношение сторон');
    const shape = button().querySelector('.ratio-shape').getBoundingClientRect();
    if (Math.abs(shape.width / shape.height - 5/3) > .03) throw new Error('Иконка не соответствует пикселям');
    applySettings({...original,width:1024,height:1024});
    button().click();
    if (readSettings().width !== 1600 || readSettings().height !== 960 || document.querySelector('#height-slider').value !== '960') throw new Error('Выбор формата не передал размеры');
    const heightInput = document.querySelector('#height-val');
    heightInput.value = '1001';
    heightInput.dispatchEvent(new Event('change',{bubbles:true}));
    if (heightInput.checkValidity() || readSettings().height !== 960) throw new Error('Некратный 8 размер принят');
    button().click();
    if (!heightInput.checkValidity() || heightInput.value !== '960') throw new Error('Выбор формата не сбросил ошибку ввода');
    if (document.querySelector('.format-actions, #save-format-btn, #delete-format-btn')) throw new Error('Остался отдельный ряд кнопок');
    button().focus();
    const edit = button().closest('.format-tile').querySelector('.format-edit');
    edit.scrollIntoView({block:'center'});
    await new Promise(resolve => requestAnimationFrame(resolve));
    const r = edit.getBoundingClientRect();
    if (getComputedStyle(edit).opacity !== '1' || !edit.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))) throw new Error('Карандаш недоступен при фокусе');
    edit.click();
    await until(() => editor.open);
    editor.querySelector('[name=name]').value = 'Обновлённый формат';
    editor.querySelector('[name=height]').value = '800';
    editor.querySelector('[type=submit]').click();
    expectedHeight = 800;
    await until(button);
    if (!button().textContent.includes('Обновлённый формат') || !button().textContent.includes('2:1') || readSettings().height !== 800) throw new Error('Редактирование не обновило выбранный формат');
    button().closest('.format-tile').querySelector('.format-delete').click();
    await until(() => document.querySelector('#action-dialog')?.open);
    document.querySelector('#action-dialog [data-cancel]').click();
    await new Promise(resolve => setTimeout(resolve,30));
    if (!button()) throw new Error('Отмена удалила формат');
    button().closest('.format-tile').querySelector('.format-delete').click();
    await until(() => document.querySelector('#action-dialog')?.open);
    document.querySelector('#action-dialog [type=submit]').click();
    await until(() => !button());
    if (readSettings().width !== 1600) throw new Error('Удаление формата изменило текущие размеры');
    return `Создание, редактирование, пропорции, фокус и удаление формата: OK (${innerWidth}×${innerHeight})`;
  } finally {
    const editor = document.querySelector('#format-editor');
    if (editor?.open) editor.close();
    const dialog = document.querySelector('#action-dialog');
    if (dialog?.open) dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
    if (stored === null) localStorage.removeItem(key); else localStorage.setItem(key,stored);
    applySettings(original);
  }
})();
