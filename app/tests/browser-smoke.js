// Выполняется в открытой панели через agent-browser eval --stdin; нужен один готовый результат.
(async () => {
  const gallery = await import('./gallery.js');
  const { randomUuid } = await import('./config.js');
  const { readSettings, applySettings } = await import('./storage.js');
  const savedHistory = [...gallery.history];
  const savedSelection = gallery.selectedHistoryItem;
  const savedIndex = gallery.selectedBatchIndex;
  const savedSettings = readSettings();
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(savedHistory.length > 0, 'Сначала выполните одну генерацию.');
  try {
    const first = structuredClone(savedHistory[0]);
    const cached = { ...structuredClone(first), promptId: randomUuid() };
    gallery.updateHistory([first, cached]);
    gallery.renderGallery();
    gallery.selectHistoryItem(cached);
    check(document.querySelectorAll('.gallery-thumb.active').length === 1, 'Кэшированный файл не должен выделять два задания');
    const batch = { ...first, batchUrls: [first.url, first.url] };
    gallery.selectHistoryItem(batch);
    check(document.querySelectorAll('#batch-grid img').length === 2, 'Сетка должна показывать оба кадра');
    check(document.getElementById('hires-current-btn').disabled, 'Сначала нужен выбор кадра');
    gallery.selectHistoryItem(batch, 2);
    check(!document.getElementById('hires-current-btn').disabled, 'Выбранный кадр должен допускать улучшение');
    gallery.selectHistoryItem({ ...batch, batchUrls: ['/view?filename=matrix-missing-check.png&type=output', first.url] });
    await new Promise(resolve => setTimeout(resolve, 500));
    check(document.querySelector('#batch-grid button').textContent === 'Кадр 1 недоступен', 'Ошибка кадра не должна блокировать сетку');
    applySettings({ ...savedSettings, seed: 0, cfg: 0, denoise: 0, faceSteps: 13, clipSkip: 2, reactorVisibility: 0 });
    const restored = readSettings();
    check(restored.seedInput === '0' && restored.cfg === 0 && restored.denoise === 0 && restored.faceSteps === 13 && restored.clipSkip === 2 && restored.reactorVisibility === 0, 'Полный снимок должен сохранять нули и расширенные параметры');
    return { cachedSelection: true, grid: true, selectedFrame: true, missingFrame: true, settings: true };
  } finally {
    gallery.updateHistory(savedHistory);
    gallery.renderGallery();
    applySettings(savedSettings);
    if (savedSelection) gallery.selectHistoryItem(savedSelection, savedIndex);
  }
})()
