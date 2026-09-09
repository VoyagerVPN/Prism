// Проверка снимка параметров улучшения. Создаёт реальное задание и отменяет его после чтения снимка.
(async () => {
  const gallery = await import('./gallery.js');
  if (!gallery.selectedHistoryItem) throw new Error('Сначала выберите готовое изображение.');
  if (document.getElementById('generate-btn').disabled) throw new Error('Дождитесь завершения текущего задания.');
  const originalFetch = window.fetch;
  const previousId = JSON.parse(sessionStorage.getItem('matrix-active-job') ?? 'null')?.promptId;
  const scale = document.getElementById('hires-scale');
  const savedScale = scale.value;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  window.fetch = async (url, options) => {
    if (new URL(url, location.href).pathname === '/view') await gate;
    return originalFetch(url, options);
  };
  let job;
  try {
    scale.value = '1.5';
    document.getElementById('hires-current-btn').click();
    scale.value = '2.0';
    release();
    for (let n = 0; n < 100; n++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      job = JSON.parse(sessionStorage.getItem('matrix-active-job') ?? 'null');
      if (job?.promptId !== previousId && job?.status !== 'submitting') break;
    }
    if (!job || job.promptId === previousId) throw new Error('Новое задание не появилось');
    if (job.settings.width !== Math.round(job.settings.inputWidth * 1.5 / 8) * 8) throw new Error('Масштаб изменился во время подготовки файла');
    return { refineSnapshot: true, promptId: job.promptId };
  } finally {
    release();
    window.fetch = originalFetch;
    scale.value = savedScale;
    if (job?.promptId && job.promptId !== previousId) {
      document.getElementById('interrupt-btn').click();
      for (let n = 0; n < 100; n++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (['cancelled', 'succeeded'].includes(JSON.parse(sessionStorage.getItem('matrix-active-job')).status)) break;
      }
      if (document.getElementById('generate-btn').disabled) throw new Error('Проверочное задание не завершено; проверьте отмену.');
    }
  }
})()
