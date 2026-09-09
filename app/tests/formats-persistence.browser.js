// Запустить трижды с перезагрузкой между этапами, затем перезагрузить ещё раз для очистки UI.
(async () => {
  const marker = 'prism_formats_test';
  const {readSettings,applySettings} = await import('./storage.js');
  const tick = () => new Promise(resolve => setTimeout(resolve,60));
  let saved = JSON.parse(sessionStorage.getItem(marker) || 'null');
  if (!saved) {
    saved = {phase:1,formats:localStorage.getItem('prism_image_formats'),settings:readSettings()};
    sessionStorage.setItem(marker,JSON.stringify(saved));
    while (document.querySelector('.res-btn')) {
      document.querySelector('.res-btn').click();
      document.querySelector('.format-delete').click();
      await tick();
      document.querySelector('#action-dialog [type=submit]').click();
      await tick();
    }
    return 'Все форматы удалены; перезагрузить';
  }
  if (saved.phase === 1) {
    if (document.querySelector('.res-btn')) throw new Error('Удалённые форматы вернулись после перезагрузки');
    applySettings({...saved.settings,width:1200,height:800});
    document.querySelector('#add-format-btn').click();
    await tick();
    document.querySelector('#format-editor [name=name]').value = 'Проверка перезагрузки';
    document.querySelector('#format-editor [type=submit]').click();
    await tick();
    saved.phase = 2;
    sessionStorage.setItem(marker,JSON.stringify(saved));
    return 'Формат 1200×800 создан; перезагрузить';
  }
  try {
    const buttons = document.querySelectorAll('.res-btn');
    if (buttons.length !== 1 || !buttons[0].textContent.includes('Проверка перезагрузки') || !buttons[0].textContent.includes('3:2')) throw new Error('Свой формат не восстановился');
    buttons[0].click();
    if (readSettings().width !== 1200 || readSettings().height !== 800) throw new Error('Восстановленный формат не применяется');
    return 'Пустой список и собственный формат пережили перезагрузку: OK';
  } finally {
    if (saved.formats === null) localStorage.removeItem('prism_image_formats'); else localStorage.setItem('prism_image_formats',saved.formats);
    applySettings(saved.settings);
    sessionStorage.removeItem(marker);
  }
})();
