// Проверяем наполненные состояния, не записывая персонажей на сервер.
(async () => {
  const {readSettings, applySettings} = await import('./storage.js');
  const {loraList} = await import('./api.js');
  const original = readSettings();
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const check = (condition, message) => {if (!condition) throw new Error(message);};
  try {
    document.querySelector('[data-mobile-panel=settings]').click();
    applySettings({...original, selectedCharacter:'none', loras:[]});
    document.querySelector('#settings-tab-image').click();
    const empty = document.querySelector('#lora-empty');
    check(getComputedStyle(empty).display !== 'none', 'Нет пустого состояния LoRA');
    document.querySelector('#add-lora-btn').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    check(getComputedStyle(empty).display === 'none', 'Пустое состояние осталось поверх добавленной LoRA');
    check(document.querySelector('.lora-row select'), 'Нет выбора LoRA');
    const loraRow = document.querySelector('.lora-row');
    check(loraRow.querySelector('textarea').getBoundingClientRect().height >= 96, 'Описание LoRA слишком низкое');
    check(loraRow.querySelector('[role=combobox]').getBoundingClientRect().width >= loraRow.clientWidth - 34, 'Выбор LoRA сжат кнопкой удаления');
    const option = [...loraRow.querySelector('select').options].find(option => option.value.endsWith('.safetensors'));
    if (option) check(!option.textContent.includes('\\') && !option.textContent.endsWith('.safetensors') && option.title === option.value, 'Название LoRA нечитаемо или потерян полный путь');
    document.querySelector('.delete-lora-btn').click();
    check(getComputedStyle(empty).display !== 'none', 'Пустое состояние не вернулось после удаления');
    applySettings({...original, selectedCharacter:'__Проверка панели__', character:{name:'__Проверка панели__',appearance:'Тестовое описание',outfits:{Обычный:'Куртка'}}, loras:loraList.length > 1 ? [{name:loraList[1],strength:0.7,description:'Проверка'}] : [], hiresToggle:true, faceToggle:true, reactorToggle:true, upscaleToggle:true, advancedToggle:true});
    check(getComputedStyle(document.querySelector('.character-empty')).display === 'none', 'Пустое состояние перекрывает персонажа');
    for (const tab of document.querySelectorAll('.settings-tabs button')) {
      tab.click();
      check(document.documentElement.scrollWidth <= innerWidth, 'Панель вышла за ширину окна');
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      const cards = [...panel.querySelectorAll(':scope > .section-card, .character-lora-column > .section-card, .processing-grid > .section-card')];
      for (const card of cards) check(card.scrollWidth <= card.clientWidth + 1, `Содержимое не помещается: ${card.id}`);
    }
    return 'Пустые и заполненные панели, добавление/удаление LoRA, персонаж и включённые обработки: OK';
  } finally {
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3', stored);
    document.querySelector('#settings-tab-image').click();
  }
})();
