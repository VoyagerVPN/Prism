const labels = {SD15: 'Stable Diffusion 1.5', SD2: 'Stable Diffusion 2', SDXL: 'SDXL', Illustrious: 'Illustrious (SDXL)', Pony: 'Pony (SDXL)', Flux: 'Flux', SD3: 'Stable Diffusion 3', Other: 'Другое', Character: 'Персонаж', Style: 'Стиль', Clothing: 'Одежда', Pose: 'Поза', Object: 'Предмет', Background: 'Фон', Utility: 'Эффект / обработка', Model: 'Модель'};

export function setupModelImport(refresh) {
  const dialog = document.querySelector('#model-import-dialog');
  const input = document.querySelector('#model-import-file');
  const form = document.querySelector('#model-import-form');
  const fields = document.querySelector('#import-fields');
  const kind = document.querySelector('#import-kind');
  const base = document.querySelector('#import-base');
  const category = document.querySelector('#import-category');
  const status = document.querySelector('#import-status');
  const save = document.querySelector('#import-save');
  const cancel = document.querySelector('#import-cancel');
  const progress = document.querySelector('#import-progress');
  const destination = document.querySelector('#import-destination');
  let file;
  let analysis;
  let uploading = false;
  let revision = 0;
  const options = (select, values, selected) => {
    select.replaceChildren(new Option('Уточните…', ''), ...values.map(value => new Option(labels[value] ?? value, value)));
    select.value = selected ?? '';
  };
  const updatePath = () => {
    const root = {loras: 'Lora', checkpoints: 'StableDiffusion', diffusion_models: 'DiffusionModels'}[kind.value];
    destination.textContent = root && base.value && category.value ? `Папка: ${root}/${kind.value === 'loras' ? category.value + '/' : ''}${base.value}/${file.name}` : 'Для сохранения уточните недостающие поля.';
  };
  const updateCategory = () => {
    options(category, kind.value === 'loras' ? analysis.categories : ['Model'], kind.value === 'loras' ? analysis.category : 'Model');
    updatePath();
  };
  async function upload() {
    if (uploading || !file || !form.reportValidity()) return;
    uploading = true;
    fields.disabled = true;
    save.disabled = true;
    cancel.disabled = true;
    progress.hidden = false;
    status.textContent = 'Загрузка…';
    const data = new FormData();
    data.append('kind', kind.value);
    data.append('base', base.value);
    data.append('category', category.value);
    data.append('file', file);
    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/dashboard/import/upload');
        xhr.responseType = 'json';
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) progress.value = event.loaded / event.total * 100;
          status.textContent = progress.value >= 100 ? 'Проверка и сохранение файла…' : `Загрузка: ${Math.round(progress.value)}%`;
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.error ?? `Ошибка загрузки: HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Соединение прервано. Проверьте библиотеку перед повтором: файл мог сохраниться.'));
        xhr.send(data);
      });
      status.textContent = `Сохранено: ${result.name}`;
      destination.textContent = result.path;
      file = null;
      cancel.textContent = 'Готово';
      try { await refresh(); } catch (error) { status.textContent += ` · Список не обновлён: ${error.message}. Нажмите обновление моделей.`; }
    } catch (error) {
      status.textContent = error.message;
      fields.disabled = false;
      save.disabled = false;
    } finally {
      uploading = false;
      cancel.disabled = false;
    }
  }
  async function inspect(files) {
    if (uploading || dialog.open) return;
    const current = ++revision;
    file = files[0];
    dialog.showModal();
    fields.disabled = true;
    save.disabled = true;
    progress.hidden = true;
    progress.value = 0;
    cancel.textContent = 'Отмена';
    document.querySelector('#import-filename').textContent = file?.name ?? '';
    document.querySelector('#import-evidence').textContent = '';
    destination.textContent = '';
    status.textContent = 'Чтение метаданных…';
    kind.value = '';
    base.replaceChildren();
    category.replaceChildren();
    try {
      if (files.length !== 1 || !file?.name.toLowerCase().endsWith('.safetensors')) throw new Error('Выберите один файл .safetensors.');
      if (file.size < 10 || file.size > 32 * 1024 ** 3) throw new Error('Допустимый размер файла: до 32 ГБ.');
      const prefix = new DataView(await file.slice(0, 8).arrayBuffer());
      const size = Number(prefix.getBigUint64(0, true));
      if (size < 2 || size > 16 * 1024 ** 2 || size + 8 > file.size) throw new Error('Некорректный заголовок safetensors.');
      const header = JSON.parse(await file.slice(8, 8 + size).text());
      const response = await fetch('/dashboard/import/analyze', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({header, name: file.name}), signal: AbortSignal.timeout(30000)});
      const result = await response.json();
      if (current !== revision) return;
      if (!response.ok) throw new Error(result.error ?? 'Не удалось прочитать метаданные.');
      analysis = result;
      kind.value = result.kind ?? '';
      options(base, result.bases, result.suggestedBase ?? result.base);
      updateCategory();
      document.querySelector('#import-evidence').textContent = Object.entries(result.evidence).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'В метаданных нет сведений о базе и назначении.';
      const suggested = result.suggestedBase && result.suggestedBase !== result.base;
      status.textContent = suggested ? `Метаданные: ${labels[result.base] ?? 'база неизвестна'}. ${labels[result.suggestedBase]} предложена по названию — проверьте выбор и назначение.` : 'Проверьте распознанные данные и уточните пустые поля.';
      fields.disabled = false;
      save.disabled = false;
      if (result.kind && result.base && result.category && !suggested) await upload();
    } catch (error) {
      if (current === revision) status.textContent = error.message;
    }
  }
  const dropzone = document.querySelector('#model-import-open');
  const dropHint = document.querySelector('#model-import-drop');
  const dropCard = document.querySelector('#lora-card');
  let dragDepth = 0;
  const hideDropHint = () => { dragDepth = 0; dropHint.hidden = true; dropCard.classList.remove('file-over'); };
  const updateDropHint = event => {
    const over = dropCard.contains(event.target);
    dropCard.classList.toggle('file-over', over);
    dropHint.querySelector('strong').textContent = over ? 'Отпустите — импортируем файл' : 'Перетащите файл сюда';
  };
  dropzone.addEventListener('click', () => input.click());
  document.addEventListener('dragenter', event => {
    if (!dialog.open && [...event.dataTransfer.types].includes('Files')) {
      if (dragDepth === 0) window.dispatchEvent(new Event('browse-loras'));
      dragDepth++; dropHint.hidden = false; updateDropHint(event);
    }
  });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) hideDropHint(); });
  document.addEventListener('dragend', hideDropHint);
  window.addEventListener('blur', hideDropHint);
  input.addEventListener('change', () => { void inspect([...input.files]); input.value = ''; });
  form.addEventListener('submit', event => { event.preventDefault(); void upload(); });
  kind.addEventListener('change', updateCategory);
  base.addEventListener('change', updatePath);
  category.addEventListener('change', updatePath);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (uploading) event.preventDefault(); });
  dialog.addEventListener('close', () => { revision++; file = null; });
  document.addEventListener('dragover', event => {
    if ([...event.dataTransfer.types].includes('Files')) {
      event.preventDefault();
      if (!dialog.open) {
        dropHint.hidden = false;
        updateDropHint(event);
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  });
  document.addEventListener('drop', event => {
    hideDropHint();
    const files = [...event.dataTransfer.files];
    if (!files.some(item => item.name.toLowerCase().endsWith('.safetensors'))) return;
    event.preventDefault();
    event.stopPropagation();
    void inspect(files);
  }, true);
}
