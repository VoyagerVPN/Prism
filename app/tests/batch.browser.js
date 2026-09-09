// Перед запуском загрузить window.batchFixtures из .cache/verification/batch-fixtures.json.
(async () => {
  const gallery = await import('./gallery.js');
  const {gridImage} = await import('./batch.js');
  const {readSettings,applySettings} = await import('./storage.js');
  const original = readSettings(), oldHistory = structuredClone(gallery.history);
  const oldSelection = gallery.selectedHistoryItem, oldIndex = gallery.selectedBatchIndex;
  const stored = localStorage.getItem('matrix_dashboard_v3');
  const storedJob = sessionStorage.getItem('matrix-active-job');
  const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const captureRepeat = async () => {
    let payload;
    if (Object.values(gallery.selectedHistoryItem.workflow).some(node => !['EmptyImage','SaveImage'].includes(node.class_type))) throw new Error('Живой повтор разрешён только для CPU-фикстур');
    const before = JSON.parse(sessionStorage.getItem('matrix-active-job') || 'null')?.promptId;
    window.addEventListener('repeat-job',event => {payload=event.detail;},{once:true});
    document.querySelector('#repeat-btn').click();
    for (let i=0; i<100; i++) {
      await new Promise(resolve => setTimeout(resolve,50));
      const job = JSON.parse(sessionStorage.getItem('matrix-active-job') || 'null');
      if (job?.promptId !== before && job?.status === 'succeeded' && !document.querySelector('#generate-btn').disabled) return payload;
      if (job?.promptId !== before && job?.status === 'failed') throw new Error(job.error);
    }
    throw new Error('Повтор CPU-кадра не завершился');
  };
  try {
    gallery.updateHistory([]); gallery.renderGallery();
    for (const [position,count] of [1,4,9].entries()) {
      const slider = document.querySelector('#batch-count');
      slider.value = position;
      slider.dispatchEvent(new Event('input',{bubbles:true}));
      slider.dispatchEvent(new Event('change',{bubbles:true}));
      if (readSettings().t2iBatchCount !== count || !slider.getAttribute('aria-valuetext').startsWith(String(count))) throw new Error('Неверная позиция 1/4/9');
    }
    for (const job of window.batchFixtures) {
      gallery.displayOutputImage(job);
      document.querySelector('[data-mobile-panel=generate]').click();
      await tick();
      const count = job.settings.batchCount;
      const grid = document.querySelector('#batch-grid');
      if (count === 1) {
        if (grid.style.display !== 'none') throw new Error('Одиночный кадр показан сеткой');
        continue;
      }
      if (grid.querySelectorAll('img').length !== count || getComputedStyle(grid).gridTemplateColumns.split(' ').length !== Math.sqrt(count)) throw new Error('Сетка не квадратная');
      const canvasBounds = document.querySelector('.canvas-container').getBoundingClientRect();
      for (const button of grid.querySelectorAll('button')) {
        const bounds = button.getBoundingClientRect();
        if (bounds.top < canvasBounds.top-1 || bounds.bottom > canvasBounds.bottom+1 || bounds.left < canvasBounds.left-1 || bounds.right > canvasBounds.right+1) throw new Error('Сетка обрезает кадры вместо показа целиком');
      }
      if (!document.querySelector('#apply-seed-btn').disabled || document.querySelector('#download-btn').disabled) throw new Error('Неверные действия для общей сетки');
      const item = gallery.selectedHistoryItem;
      const blob = await gridImage(item.batchUrls);
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width !== Math.sqrt(count)*64 || bitmap.height !== Math.sqrt(count)*64) throw new Error('PNG не склеен в квадрат');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap,0,0);
      const pixel = context.getImageData(32,32,1,1).data;
      if (Math.abs(pixel[0]-224)>1 || Math.abs(pixel[1]-82)>1 || Math.abs(pixel[2]-82)>1) throw new Error('PNG потерял первый кадр или изменил порядок');
      bitmap.close();
      if (grid.querySelectorAll('button').length !== count) throw new Error(`Предпросмотр серии ${count} изменился во время сборки PNG: ${grid.children.length}, кадр ${gallery.selectedBatchIndex}`);
      grid.querySelectorAll('button')[2].click();
      if (gallery.selectedBatchIndex !== 3 || !document.querySelector('#metadata-summary').textContent.includes('Seed: 102')) throw new Error('Кадр получил чужой seed');
      document.querySelector('#seed-random-btn').click();
      document.querySelector('#seed-lock-btn').click();
      if (document.querySelector('#seed-input').value !== '102') throw new Error('Фиксация не использовала выбранный кадр');
      document.querySelector('#apply-seed-btn').click();
      if (document.querySelector('#seed-input').value !== '102') throw new Error('Не скопирован seed кадра');
      document.querySelector('#apply-prompt-btn').click();
      if (readSettings().batchCount !== 1 || readSettings().seedInput !== '102') throw new Error('Параметры кадра восстановили серию');
      const frame = await captureRepeat();
      if (frame.settings.seed !== 102 || frame.settings.batchCount !== 1 || Object.keys(frame.workflow).some(id => !id.startsWith('frame_2_'))) throw new Error('Повтор кадра повторяет всю серию');
      gallery.selectHistoryItem(item,0);
      const series = await captureRepeat();
      if (series.settings.batchCount !== count || Object.values(series.workflow).filter(node => node.class_type === 'SaveImage').length !== count) throw new Error('Повтор серии потерял кадры');
    }
    return `1/4/9, квадратный PNG, seed и отдельный повтор кадра/серии: OK (${innerWidth}×${innerHeight})`;
  } finally {
    gallery.updateHistory(oldHistory); gallery.renderGallery();
    if (oldSelection) gallery.selectHistoryItem(oldSelection,oldIndex);
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3',stored);
    if (storedJob === null) sessionStorage.removeItem('matrix-active-job'); else sessionStorage.setItem('matrix-active-job',storedJob);
  }
})();
