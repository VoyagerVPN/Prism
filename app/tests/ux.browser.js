// Запуск в консоли загруженной панели; проверка не меняет JSON персонажей.
(async () => {
  const { readSettings, applySettings, loadSavedSettings } = await import('/dashboard/storage.js');
  const original = readSettings();
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const missing = '__UX_удалённый_персонаж__';
  const snapshot = { selectedCharacter: missing, character: { name: missing, appearance: 'Из старой генерации', outfits: { 'Обычный': '' } } };
  try {
    const steps = document.querySelector('#steps-slider');
    steps.value = '30';
    const value = steps.value;
    steps.closest('.input-group').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    if (Number(steps.value) !== Number(value) - 1) throw new Error('Колесо не меняет шаги');
    const width = document.querySelector('#width-slider');
    width.value = width.max;
    width.dispatchEvent(new WheelEvent('wheel', {deltaY:-100,bubbles:true,cancelable:true}));
    if(width.value !== width.max) throw new Error('Колесо вышло за максимум');
    localStorage.setItem('matrix_dashboard_v3', JSON.stringify(snapshot));
    loadSavedSettings();
    if (document.querySelector('#character-select').value !== 'none') throw new Error('Удалённый персонаж вернулся из браузерных настроек');
    applySettings(snapshot);
    if (document.querySelector('#character-select').value !== missing) throw new Error('Явное восстановление исторического снимка потеряло персонажа');
    return 'Удалённый персонаж не возвращается при загрузке; исторический снимок восстанавливается явно';
  } finally {
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3');
    else localStorage.setItem('matrix_dashboard_v3', stored);
  }
})();
