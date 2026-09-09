// Запускать на нескольких размерах окна. Изменения формы восстанавливаются без записи на сервер.
(async () => {
  const { readSettings, applySettings } = await import('./storage.js');
  const { loraList } = await import('./api.js');
  const original = readSettings();
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const failures = [];
  let checked = 0;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  async function inspect() {
    await frame();
    if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('Горизонтальная прокрутка');
    for (const toggle of document.querySelectorAll('.switch')) {
      if (!toggle.getBoundingClientRect().height) continue;
      const input = toggle.querySelector('input');
      if (input.disabled) continue;
      const checked = input.checked;
      for (let i = 0; i < 2; i++) {
        input.click();
        const track = toggle.querySelector('.slider');
        const thumb = getComputedStyle(track, '::before');
        const translate = new DOMMatrix(thumb.transform).m41;
        const right = parseFloat(thumb.left) + translate + parseFloat(thumb.width);
        if (toggle.getBoundingClientRect().width < 44 || right > track.clientWidth) failures.push(`${input.id}: переключатель сжат или бегунок вышел за трек`);
        if (i === 0 && input.checked === checked) failures.push(`${input.id}: переключение не работает`);
      }
    }
    if (innerWidth <= 1100) {
      for (const button of document.querySelectorAll('.sidebar button')) {
        const r = button.getBoundingClientRect();
        if (r.height && (r.height < 44 || r.width < 44)) failures.push(`${button.id || button.className}: маленькая кнопка ${r.width}×${r.height}`);
      }
    }
    for (const field of document.querySelectorAll('textarea,input[type=text]:not(.dropdown-input):not(.items-placeholder),input[type=number],[role=combobox]')) {
      if (!field.getBoundingClientRect().height || field.disabled || field.closest('.ts-wrapper.disabled')) continue;
      field.scrollIntoView({ block: 'center', inline: 'nearest' });
      field.focus({ preventScroll: true });
      await frame();
      const r = field.getBoundingClientRect();
      const label = field.id || field.className || field.tagName;
      const style = getComputedStyle(field);
      const textHeight = r.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
      if (r.width < 64 || textHeight < parseFloat(style.fontSize) * 1.2) failures.push(`${label}: текст не помещается ${r.width}×${r.height}`);
      if (innerWidth <= 1100 && r.height < (field.tagName === 'TEXTAREA' ? 72 : 44)) failures.push(`${label}: слишком низкое поле ${r.height}`);
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !field.contains(document.elementFromPoint(x, y))) failures.push(`${label}: поле перекрыто или вне окна`);
      if (field.tagName === 'TEXTAREA' || field.type === 'text') {
        const value = field.value;
        field.value = 'Проверка ввода текста';
        if (field.value !== 'Проверка ввода текста') failures.push(`${label}: ввод не работает`);
        field.value = value;
      }
      checked++;
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', keyCode:27, bubbles:true}));
    }
  }
  try {
    applySettings({ ...original, selectedCharacter: '__Проверка полей__', character: { name: '__Проверка полей__', appearance: 'Описание', outfits: { Обычный: 'Куртка' } }, loras: loraList.length > 1 ? [{ name: loraList[1], strength: 0.7, description: 'Описание LoRA' }] : [], advancedToggle: true, hiresToggle: true, faceToggle: true, reactorToggle: true, upscaleToggle: true });
    document.querySelector('[data-mobile-panel=settings]').click();
    document.querySelector('#settings-tab-image').click();
    await frame();
    document.querySelector('#seed-variation').open = true;
    await inspect();
    document.querySelector('#settings-tab-processing').click();
    await inspect();
    document.querySelector('[data-mobile-panel=generate]').click();
    await inspect();
    if (failures.length) throw new Error([...new Set(failures)].join('\n'));
    return `Поля доступны, ввод и размеры: ${checked} проверок при ${innerWidth}×${innerHeight}`;
  } finally {
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3', stored);
    document.querySelector('#settings-tab-image').click();
    document.querySelector('[data-mobile-panel=generate]').click();
    window.scrollTo(0, 0);
  }
})();
