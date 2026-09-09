(async () => {
  const {history,updateHistory} = await import('./gallery.js');
  const {readSettings,applySettings} = await import('./storage.js');
  const original = readSettings(), previous = structuredClone(history);
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const input = document.querySelector('#seed-input');
  try {
    updateHistory([{seed:123456789},{seed:999}]);
    document.querySelector('#seed-random-btn').click();
    document.querySelector('#seed-lock-btn').click();
    if (input.value !== '123456789') throw new Error('Фиксация не взяла seed последнего результата');
    input.value = '42';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    updateHistory([{seed:777}]);
    if (input.value !== '42') throw new Error('Новый результат затёр ручной seed');
    document.querySelector('#seed-random-btn').click();
    document.querySelector('#seed-lock-btn').click();
    if (input.value !== '777') throw new Error('Использован устаревший seed');
    updateHistory([{seed:0}]);
    document.querySelector('#seed-random-btn').click();
    document.querySelector('#seed-lock-btn').click();
    if (input.value !== '0') throw new Error('Нулевой seed потерян');
    document.querySelector('#seed-random-btn').click();
    const strength = document.querySelector('#variation-strength');
    strength.value = '0.1';
    strength.dispatchEvent(new Event('input',{bubbles:true}));
    strength.dispatchEvent(new Event('change',{bubbles:true}));
    if (readSettings().seedMode !== 'lock' || input.value !== '0' || readSettings().variationStrength !== .1) throw new Error('Вариация не зафиксировала исходный seed');
    applySettings({...original,seed:123,variationSeed:456,variationStrength:.12});
    if (document.querySelector('#variation-seed-input').value !== '456' || !document.querySelector('#seed-variation').open) throw new Error('Seed вариации не восстановлен из снимка');
    const {variationSeed,variationSeedInput,variationStrength,...legacy} = original;
    applySettings(legacy);
    if (readSettings().variationStrength !== 0) throw new Error('Старая история унаследовала вариацию');
    return 'Последний seed, ручной ввод, фиксация для вариации и восстановление снимка: OK';
  } finally {
    updateHistory(previous);
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3',stored);
  }
})();
