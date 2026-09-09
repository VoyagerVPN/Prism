// Запустить в консоли панели при ширине окна 360–430 px после загрузки моделей.
(() => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const visible = selector => document.querySelector(selector)?.getBoundingClientRect().height > 0;
  check(document.documentElement.scrollWidth <= innerWidth, 'Есть горизонтальная прокрутка');
  check(visible('.mobile-nav'), 'Нет мобильной навигации');
  const launch = document.querySelector('#generate-btn').getBoundingClientRect();
  check(launch.height >= 44 && launch.bottom <= innerHeight, 'Кнопка запуска недоступна для касания');
  document.querySelector('.mobile-nav [data-mobile-panel="settings"]').click();
  check(visible('.sidebar') && !visible('.workspace'), 'Параметры не открылись отдельным экраном');
  check(document.documentElement.scrollWidth <= innerWidth, 'Параметры выходят за ширину экрана');
  document.querySelector('#settings-tab-image').click();
  const characterControl = document.querySelector('#character-select').options.length > 1 ? '#character-select + .ts-wrapper [role=combobox]' : '#add-character-btn';
  check(document.querySelector(characterControl).getBoundingClientRect().height >= 44, 'Действие с персонажем слишком мелкое');
  document.querySelector('#settings-tab-image').click();
  document.querySelector('.mobile-nav [data-mobile-panel="generate"]').click();
  check(visible('.workspace') && !visible('.sidebar'), 'Экран генерации не восстановлен');
  check(document.querySelector('#positive-prompt').getBoundingClientRect().height >= 96, 'Поле описания слишком маленькое');
  return 'Мобильная навигация, размеры элементов и отсутствие горизонтальной прокрутки: OK';
})();
