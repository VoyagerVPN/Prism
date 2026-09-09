(async () => {
  const {readSettings, applySettings} = await import('./storage.js');
  const original = readSettings();
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const editor = document.querySelector('#character-editor');
  try {
    document.querySelector('[data-mobile-panel=settings]').click();
    document.querySelector('#settings-tab-image').click();
    const snapshot = {name:'__Проверка редактора__',appearance:'Короткий текст',activeOutfitName:'Обычный',outfits:{Обычный:'Куртка'}};
    applySettings({...original,selectedCharacter:snapshot.name,character:snapshot});
    await tick();
    const card = document.querySelector('#character-card');
    for (const id of ['char-lora-strength','char-outfit-input','char-outfit-toggle','char-outfit-select','add-outfit-btn','rename-outfit-btn','delete-outfit-btn']) {
      const control = document.getElementById(id);
      if (!card.contains(control) || editor.contains(control)) throw new Error(`Одежда недоступна без редактора: ${id}`);
    }
    if (!document.querySelector('#char-outfit-input').getBoundingClientRect().height) throw new Error('Описание одежды скрыто');
    const initialHeight = card.getBoundingClientRect().height;
    applySettings({...original,selectedCharacter:snapshot.name,character:{...snapshot,appearance:'Очень длинное описание внешности. '.repeat(100),outfits:{Обычный:'Много подробностей одежды. '.repeat(100)}}});
    await tick();
    if (card.getBoundingClientRect().height > initialHeight + 85) throw new Error('Длинное описание растягивает карточку');
    document.querySelector('#edit-character-btn').click();
    await tick();
    if (!editor.open) throw new Error('Редактор не открылся');
    for (const field of editor.querySelectorAll('textarea,input[type=text]:not(.items-placeholder):not(.dropdown-input),[role=combobox]')) {
      if (!field.getBoundingClientRect().height) continue;
      field.scrollIntoView({block:'center'});
      await tick();
      const r = field.getBoundingClientRect();
      if (r.height < 44 || r.width < 100 || r.left < 0 || r.right > innerWidth || !field.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))) throw new Error(`Поле редактора недоступно: ${field.id}`);
    }
    document.querySelector('#delete-character-btn').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    const confirmation = document.querySelector('#action-dialog');
    if (!confirmation?.open) throw new Error('Удаление не использует кастомное подтверждение');
    confirmation.querySelector('[data-cancel]').click();
    await tick();
    if (!editor.open || document.querySelector('#character-select').value !== snapshot.name) throw new Error('Отмена удалила персонажа или закрыла редактор');
    document.querySelector('#close-character-editor').click();
    if (editor.open) throw new Error('Редактор не закрылся');
    return `Компактная карточка, редактор и отмена удаления — OK (${innerWidth}×${innerHeight})`;
  } finally {
    if (editor.open) editor.close();
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3',stored);
  }
})();
