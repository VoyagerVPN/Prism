// Запустить в консоли загруженной панели. Создаёт и удаляет только своего тестового персонажа.
(async () => {
  const until = async predicate => {
    const deadline = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Сохранение персонажа не завершилось');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const status = document.querySelector('#character-storage-status');
  const select = document.querySelector('#character-select');
  const originalFetch = window.fetch;
  let testName;
  try {
    window.fetch = async (url, options) => {
      if (url === '/dashboard/characters' && options?.method === 'POST') await new Promise(resolve => setTimeout(resolve, 100));
      return originalFetch(url, options);
    };
    document.querySelector('#add-character-btn').click();
    await until(() => select.value !== 'none' && status.textContent === 'Изменения сохранены');
    testName = select.value;
    for (const [id, value] of [['char-appearance-input', 'Проверка быстрой записи'], ['char-outfit-input', 'Куртка']]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelector('#save-character-btn').click();
    await until(() => document.querySelector('#save-character-btn').textContent.includes('Сохранено'));
    const response = await originalFetch('/dashboard/characters');
    const saved = (await response.json()).characters[testName];
    if (saved.appearance !== 'Проверка быстрой записи' || saved.outfits['По умолчанию'] !== 'Куртка') throw new Error('Быстрый ввод потерял изменения');
    document.querySelector('#close-character-editor').click();
    const weight = document.querySelector('#char-lora-strength');
    if (!document.querySelector('#character-card').contains(weight)) throw new Error('Вес LoRA остался в редакторе');
    weight.value = '.65';
    weight.dispatchEvent(new Event('input', {bubbles:true}));
    weight.dispatchEvent(new Event('change', {bubbles:true}));
    await until(() => status.textContent === 'Изменения сохранены');
    if ((await (await originalFetch('/dashboard/characters')).json()).characters[testName].strength !== .65) throw new Error('Вес LoRA не сохранён');
    document.querySelector('#add-outfit-btn').click();
    await until(() => document.querySelector('#action-dialog')?.open);
    const dialog = document.querySelector('#action-dialog');
    dialog.querySelector('input').value = 'Вечерний';
    dialog.querySelector('[type=submit]').click();
    const outfitSelect = document.querySelector('#char-outfit-select');
    await until(() => outfitSelect.value === 'Вечерний' && status.textContent === 'Изменения сохранены');
    const outfitInput = document.querySelector('#char-outfit-input');
    outfitInput.value = 'Платье';
    outfitInput.dispatchEvent(new Event('change', {bubbles:true}));
    await until(() => status.textContent === 'Изменения сохранены');
    outfitSelect.tomselect.setValue('По умолчанию');
    await until(() => outfitInput.value === 'Куртка' && status.textContent === 'Изменения сохранены');
    outfitSelect.tomselect.setValue('Вечерний');
    await until(() => outfitInput.value === 'Платье' && status.textContent === 'Изменения сохранены');
    const updated = (await (await originalFetch('/dashboard/characters')).json()).characters[testName];
    if (updated.appearance !== saved.appearance || updated.outfits['Вечерний'] !== 'Платье' || updated.activeOutfitName !== 'Вечерний') throw new Error('Смена одежды потеряла данные');
    if (document.querySelector('#character-editor').open) throw new Error('Смена одежды требует редактора');
    return 'Сохранение и смена комплектов без изменения внешности через HTTP: OK';
  } finally {
    window.fetch = originalFetch;
    if (testName) {
      const current = await (await originalFetch('/dashboard/characters')).json();
      delete current.characters[testName];
      const response = await originalFetch('/dashboard/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
      if (!response.ok) throw new Error('Не удалось удалить тестового персонажа: обновите список и удалите его вручную');
    }
  }
})();
