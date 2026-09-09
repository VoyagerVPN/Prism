(() => {
  const tabs = [...document.querySelectorAll('.settings-tabs [role=tab]')];
  if (tabs.length !== 2) throw new Error('Нужны две видимые вкладки настроек');
  const seed = document.querySelector('#seed-input').value;
  for (const tab of tabs) {
    tab.click();
    const panels = [...document.querySelectorAll('.settings-panel')].filter(panel => !panel.hidden);
    if (panels.length !== 1 || panels[0].id !== tab.getAttribute('aria-controls')) throw new Error('Видна неверная панель');
  }
  if (document.querySelector('#seed-input').value !== seed) throw new Error('Переключение потеряло настройки');
  tabs[0].click();
  tabs[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
  if (tabs[1].getAttribute('aria-selected') !== 'true') throw new Error('Клавиатурная навигация не работает');
  tabs[0].click();
  if (innerWidth > 1100) {
    const sidebar = document.querySelector('.sidebar');
    const model = document.querySelector('#generation-model-card').getBoundingClientRect();
    const output = document.querySelector('#output-settings-card').getBoundingClientRect();
    const character = document.querySelector('#character-card').getBoundingClientRect();
    if (!(model.right < output.left && output.right < character.left && model.top === character.top)) throw new Error('Нет трёх столбцов');
    if (Math.abs(model.width - character.width) > 1 || Math.abs(model.width - output.width) > 1 || Math.abs(model.bottom - character.bottom) > 1 || Math.abs(model.bottom - output.bottom) > 1) throw new Error('Карточки не выровнены по общей сетке');
    const lora = document.querySelector('#lora-card').getBoundingClientRect();
    if (Math.abs(lora.left - model.left) > 1 || Math.abs(lora.right - character.right) > 1 || lora.top < model.bottom) throw new Error('LoRA не занимает отдельный ряд сетки');
    if (sidebar.getBoundingClientRect().bottom > innerHeight + 1) throw new Error('Панель выше окна');
    const previousScroll = sidebar.scrollTop;
    sidebar.scrollTop = sidebar.scrollHeight;
    const addLora = document.querySelector('#add-lora-btn').getBoundingClientRect();
    if (addLora.bottom > innerHeight || addLora.top < 0) throw new Error('Нижняя кнопка LoRA недоступна после прокрутки');
    sidebar.scrollTop = previousScroll;
  }
  return 'Две вкладки, одна панель, сохранность настроек и клавиатура: OK';
})();
