import { showNotice } from './dialogs.js';
import {frameSettings,gridImage} from './batch.js';
import { canvasPlaceholder, imageLoader, outputImage, galleryItems, metadataBar, metadataSummary, applyPromptBtn, applySeedBtn, applyI2IBtn, hiresToggle, faceToggle, upscaleToggle, upscaleSelect, hiresCurrentBtn, fullscreenBtn, lightbox, lightboxClose, lightboxPrev, lightboxNext, lightboxImg, lightboxCaption, batchThumbnails, reactorToggle, reactorDetection, reactorRestore, reactorVisibility, reactorCodeformerWeight, reactorIndexSource, reactorIndexInput } from './elements.js';
import { switchMode, setSeedMode, setLastGeneratedSeed, reactorImageName } from './state.js';



import { imageUrl } from './api.js';

export let history = [];
export let selectedHistoryItem = null;
export let selectedBatchIndex = 0;
export let lightboxScale = 1.0;

function selectedSettings(item = selectedHistoryItem, index = selectedBatchIndex) {
  const settings = item.settings ?? item;
  return index > 0 && settings.batchLayout === 'square-v1' ? frameSettings(settings,index-1) : settings;
}

export function updateHistory(newHistory) {
  history = newHistory;
  setLastGeneratedSeed(history[0]?.seed);
}

export function displayOutputImage(job) {
  const existing = history.find(item => item.promptId === job.promptId);
  if (existing) return;
  const urls = job.outputs.map(imageUrl);
  if (!urls.length) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', { detail: 'Задание завершено, но SaveImage не вернул файлов.' }));
    return;
  }
  const settings = structuredClone(job.settings);
  const item = {
    ...settings, version: 3, promptId: job.promptId, settings,
    workflow: structuredClone(job.workflow), outputs: structuredClone(job.outputs),
    url: urls[0], batchUrls: urls.length > 1 ? urls : [], timestamp: job.finishedAt ?? Date.now(),
    hires: settings.hiresToggle ? { scale: settings.hiresScale, denoise: settings.hiresDenoise } : null,
    face: settings.faceToggle ? { threshold: settings.faceThreshold, steps: settings.faceSteps } : null,
    upscale: settings.upscaleToggle ? { model: settings.upscaleSelect } : null,
    reactor: settings.reactorToggle ? {
      detection: settings.reactorDetection, restore: settings.reactorRestore,
      visibility: settings.reactorVisibility, codeformerWeight: settings.reactorCodeformerWeight,
      indexSource: settings.reactorIndexSource, indexInput: settings.reactorIndexInput, imageName: settings.reactorImageName
    } : null,
  };
  history.unshift(item);
  setLastGeneratedSeed(item.seed);
  history = history.slice(0, 15);
  imageLoader.style.display = 'none';
  renderGallery();
  selectHistoryItem(item);
  window.dispatchEvent(new CustomEvent('save-settings'));
}

export function renderGallery() {
  const galleryBar = document.querySelector(".gallery-bar");
  if (history.length === 0) {
    galleryBar.style.display = "none";
    return;
  }
  galleryBar.style.display = "block";
  
  galleryItems.innerHTML = "";
  history.forEach((item, index) => {
    const thumb = document.createElement("button");
    thumb.type = 'button';
    thumb.setAttribute('aria-label', `Результат ${index + 1}, Seed ${item.seed ?? 'неизвестен'}`);
    thumb.className = "gallery-thumb" + (selectedHistoryItem && (selectedHistoryItem.promptId ?? selectedHistoryItem.url) === (item.promptId ?? item.url) ? " active" : "");
    thumb.style.backgroundImage = `url('${item.url}')`;
    if (item.batchUrls?.length > 1) {
      const count = document.createElement('span');
      count.className = 'history-count';
      count.textContent = `${Math.ceil(Math.sqrt(item.batchUrls.length))}×${Math.ceil(Math.sqrt(item.batchUrls.length))}`;
      thumb.append(count);
    }
    thumb.addEventListener("click", () => {
      selectHistoryItem(item);
    });
    galleryItems.appendChild(thumb);
  });
}

export function selectHistoryItem(item, batchIndex = 0) {
  selectedHistoryItem = item;
  selectedBatchIndex = batchIndex;
  
  Array.from(galleryItems.children).forEach((thumb, index) => {
    const record = history[index];
    thumb.classList.toggle('active', (record?.promptId ?? record?.url) === (item.promptId ?? item.url));
    thumb.setAttribute('aria-pressed', String(thumb.classList.contains('active')));
  });
  
  let displayUrl = item.url;
  const hasBatch = item.batchUrls && item.batchUrls.length > 1;
  
  if (hasBatch && batchIndex > 0 && item.batchUrls[batchIndex - 1]) {
    displayUrl = item.batchUrls[batchIndex - 1];
  }
  
  const grid = document.getElementById('batch-grid');
  grid.replaceChildren();
  const showGrid = hasBatch && batchIndex === 0;
  grid.style.gridTemplateColumns = `repeat(${Math.ceil(Math.sqrt(item.batchUrls?.length || 1))},minmax(0,1fr))`;
  grid.style.display = showGrid ? 'grid' : 'none';
  outputImage.style.display = showGrid ? 'none' : 'block';
  outputImage.src = displayUrl;
  if (showGrid) {
    item.batchUrls.forEach((url, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `Выбрать кадр ${index + 1}`;
      const number = document.createElement('span');
      number.className = 'batch-number';
      number.textContent = index+1;
      const image = document.createElement('img');
      image.alt = `Кадр ${index + 1}`;
      image.src = url;
      image.onerror = () => { button.textContent = `Кадр ${index + 1} недоступен`; };
      button.append(image,number);
      button.addEventListener('click', () => selectHistoryItem(item, index + 1));
      grid.appendChild(button);
    });
  }
  document.getElementById('download-btn').disabled = false;
  document.getElementById('download-btn').title = showGrid ? 'Скачать сетку PNG' : 'Скачать выбранный кадр';
  document.getElementById('repeat-btn').disabled = !item.workflow;
  document.getElementById('repeat-btn').title = item.workflow ? 'Повторить сохранённый граф с исходными параметрами' : 'У старой записи не сохранён точный граф';
  document.getElementById('repeat-btn').textContent = showGrid || (hasBatch && item.settings?.batchLayout !== 'square-v1') ? 'Повторить серию' : 'Повторить кадр';
  canvasPlaceholder.style.display = "none";
  
  // Рендеринг эскизов батча
  if (hasBatch) {
    batchThumbnails.style.display = "flex";
    batchThumbnails.innerHTML = "";
    
    // Эскиз сетки
    const gridThumb = document.createElement("button");
    gridThumb.type = 'button';
    gridThumb.className = "batch-thumb" + (batchIndex === 0 ? " active" : "");
    gridThumb.textContent = 'Сетка';
    gridThumb.setAttribute('aria-label', 'Показать всю серию');
    gridThumb.setAttribute('aria-pressed', String(batchIndex === 0));
    gridThumb.title = "Сетка (Grid)";
    gridThumb.addEventListener("click", () => {
      selectHistoryItem(item, 0);
    });
    batchThumbnails.appendChild(gridThumb);
    
    // Эскизы кадров
    item.batchUrls.forEach((url, i) => {
      const idx = i + 1;
      const thumb = document.createElement("button");
      thumb.type = 'button';
      thumb.setAttribute('aria-label', `Кадр ${idx}`);
      thumb.setAttribute('aria-pressed', String(batchIndex === idx));
      thumb.className = "batch-thumb" + (batchIndex === idx ? " active" : "");
      thumb.style.backgroundImage = `url('${url}')`;
      thumb.title = `Изображение ${idx}`;
      thumb.addEventListener("click", () => {
        selectHistoryItem(item, idx);
      });
      batchThumbnails.appendChild(thumb);
    });
  } else {
    batchThumbnails.style.display = "none";
    batchThumbnails.innerHTML = "";
  }
  
  metadataBar.style.display = "flex";
  
  let loraStr = item.loras && item.loras.length > 0 
    ? ` | LoRA: ${item.loras.map(l => `${l.name} (${l.strength})`).join(", ")}` 
    : "";
  
  let charStr = item.character ? ` | Персонаж: ${item.character.name}` : "";
  let sizeStr = item.width ? ` | Размер: ${item.width}x${item.height}` : ` | Img2Img (Denoise: ${item.denoise})`;
  
  const settings = selectedSettings(item,batchIndex);
  let activeSeed = settings.seed;
  setLastGeneratedSeed(activeSeed);
  let batchInfoStr = "";
  if (hasBatch) {
    if (batchIndex === 0) {
      batchInfoStr = " | Сетка";
    } else {
      batchInfoStr = ` | Кадр: ${batchIndex}/${item.batchUrls.length}`;
    }
  }
  
  const variationInfo = settings.variationStrength > 0 ? ` | Вариация: ${settings.variationSeed}, сила ${settings.variationStrength}` : '';
  const seriesSeed = hasBatch && (showGrid || item.settings?.batchLayout !== 'square-v1');
  metadataSummary.textContent = `Модель: ${(item.checkpoint ?? "Неизвестно").split("/").pop()} | Steps: ${item.steps} | CFG: ${item.cfg} | Seed${seriesSeed ? ' серии' : ''}: ${activeSeed}${variationInfo}${sizeStr}${charStr}${loraStr}${batchInfoStr}`;
  
  applyPromptBtn.disabled = false;
  applySeedBtn.disabled = showGrid || seriesSeed;
  applySeedBtn.title = showGrid ? 'Сначала выберите кадр в сетке' : seriesSeed ? 'У старой серии сохранён только общий seed' : 'Взять seed выбранного кадра';
  applyI2IBtn.disabled = showGrid;
  hiresCurrentBtn.disabled = showGrid || !item.settings;
  hiresCurrentBtn.title = showGrid ? 'Сначала выберите кадр' : 'Улучшить выбранный файл';
  fullscreenBtn.style.display = showGrid ? "none" : "block";
}

export function initGalleryEvents() {
  applyPromptBtn.addEventListener('click', () => {
    if (!selectedHistoryItem) return;
    window.dispatchEvent(new CustomEvent('restore-history-settings', { detail: structuredClone(selectedSettings()) }));
  });

  applySeedBtn.addEventListener("click", () => {
    if (selectedHistoryItem && selectedHistoryItem.seed !== null) {
      const seedInput = document.getElementById("seed-input");
      const settings = selectedSettings();
      let activeSeed = settings.seed;
      seedInput.value = activeSeed;
      if (settings.variationStrength > 0) {
        document.getElementById('variation-seed-input').value = settings.variationSeed;
        document.getElementById('variation-strength').value = settings.variationStrength;
        document.getElementById('variation-strength-val').textContent = Number(settings.variationStrength).toFixed(2);
        document.getElementById('seed-variation').open = true;
      }
      setSeedMode("lock");
    }
  });
  
  applyI2IBtn.addEventListener("click", async () => {
    if (selectedHistoryItem) {
      try {
        let activeUrl = selectedHistoryItem.url;
        if (selectedBatchIndex > 0 && selectedHistoryItem.batchUrls && selectedHistoryItem.batchUrls[selectedBatchIndex - 1]) {
          activeUrl = selectedHistoryItem.batchUrls[selectedBatchIndex - 1];
        }
        const response = await fetch(activeUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], "generation.png", { type: "image/png" });
        switchMode("i2i");
        
        const event = new CustomEvent("apply-i2i-file", { detail: { file } });
        window.dispatchEvent(event);
      } catch (e) {
        console.error(e);
        await showNotice("Не удалось переслать изображение в Img2Img");
      }
    }
  });

  hiresCurrentBtn.addEventListener('click', () => {
    if (selectedHistoryItem?.settings) {
      const index = selectedBatchIndex > 0 ? selectedBatchIndex - 1 : 0;
      window.dispatchEvent(new CustomEvent('refine-image', { detail: { item: {...structuredClone(selectedHistoryItem),settings:structuredClone(selectedSettings())}, index } }));
    }
  });
  document.getElementById('repeat-btn').addEventListener('click', () => {
    if (!selectedHistoryItem?.workflow) return;
    const item = structuredClone(selectedHistoryItem);
    if (selectedBatchIndex > 0 && item.settings?.batchLayout === 'square-v1') {
      const prefix = `frame_${selectedBatchIndex-1}_`;
      item.workflow = Object.fromEntries(Object.entries(item.workflow).filter(([id]) => id.startsWith(prefix)));
      item.settings = structuredClone(selectedSettings());
    }
    window.dispatchEvent(new CustomEvent('repeat-job', { detail:item }));
  });
  document.getElementById('download-btn').addEventListener('click', async () => {
    if (!selectedHistoryItem) return;
    const item = selectedHistoryItem, index = selectedBatchIndex;
    const isGrid = item.batchUrls?.length > 1 && index === 0;
    let url;
    try {
      url = isGrid ? URL.createObjectURL(await gridImage(item.batchUrls)) : index > 0 ? item.batchUrls[index-1] : item.url;
      const link = document.createElement('a');
      link.href = url; link.download = `prism_${isGrid ? 'grid' : 'frame'}_${Date.now()}.png`;
      document.body.append(link); link.click(); link.remove();
    } catch (error) { await showNotice(`Не удалось скачать изображение: ${error.message}`); }
    finally { if (isGrid && url) setTimeout(() => URL.revokeObjectURL(url),1000); }
  });

  // Lightbox event listeners
  fullscreenBtn.addEventListener("click", openLightbox);
  outputImage.addEventListener("click", openLightbox);
  outputImage.style.cursor = "zoom-in";

  lightboxClose.addEventListener("click", closeLightbox);
  
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightboxImg && lightboxImg.naturalWidth > 0) {
      // object-fit оставляет поля внутри img; учитываем и текущий масштаб.
      const rect = lightboxImg.getBoundingClientRect();
      const scale = Math.min(rect.width / lightboxImg.naturalWidth, rect.height / lightboxImg.naturalHeight);
      const width = lightboxImg.naturalWidth * scale;
      const height = lightboxImg.naturalHeight * scale;
      const left = rect.left + (rect.width - width) / 2;
      const top = rect.top + (rect.height - height) / 2;
      if (e.clientX < left || e.clientX > left + width || e.clientY < top || e.clientY > top + height) closeLightbox();
      return;
    }
    if (e.target === lightbox || e.target.classList.contains("lightbox-content")) {
      closeLightbox();
    }
  });

  lightboxPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
  });

  lightboxNext.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(1);
  });

  window.addEventListener("keydown", (e) => {
    if (lightbox.style.display === "flex") {
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        navigateLightbox(-1);
      } else if (e.key === "ArrowRight") {
        navigateLightbox(1);
      }
    }
  });

  // Zoom в лайтбоксе с помощью Ctrl + колёсико
  lightbox.addEventListener("wheel", (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const zoomStep = 0.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      lightboxScale += direction * zoomStep;
      
      // Ограничиваем масштаб от 0.5x до 5.0x
      if (lightboxScale < 0.5) lightboxScale = 0.5;
      if (lightboxScale > 5.0) lightboxScale = 5.0;
      
      lightboxScale = parseFloat(lightboxScale.toFixed(2));
      lightboxImg.style.transform = `scale(${lightboxScale})`;
    }
  }, { passive: false });
}

export function openLightbox() {
  if (!selectedHistoryItem) return;
  
  let activeUrl = selectedHistoryItem.url;
  if (selectedBatchIndex > 0 && selectedHistoryItem.batchUrls && selectedHistoryItem.batchUrls[selectedBatchIndex - 1]) {
    activeUrl = selectedHistoryItem.batchUrls[selectedBatchIndex - 1];
  }
  
  lightboxImg.src = activeUrl;
  
  // Сбрасываем уровень зума при открытии
  lightboxScale = 1.0;
  lightboxImg.style.transform = "scale(1)";
  
  let sizeStr = selectedHistoryItem.width 
    ? `${selectedHistoryItem.width}x${selectedHistoryItem.height}` 
    : `Img2Img (Denoise: ${selectedHistoryItem.denoise})`;
    
  let modelName = (selectedHistoryItem.checkpoint ?? "Неизвестно").split("/").pop();
  
  const frame = selectedSettings();
  let activeSeed = frame.seed ?? "random";
  let batchInfoStr = "";
  if (selectedHistoryItem.batchUrls && selectedHistoryItem.batchUrls.length > 1) {
    if (selectedBatchIndex === 0) {
      batchInfoStr = " | Сетка";
    } else {
      batchInfoStr = ` | Кадр: ${selectedBatchIndex}/${selectedHistoryItem.batchUrls.length}`;
    }
  }
  
  const variation = frame.variationStrength > 0 ? ` | Вариация: ${frame.variationSeed}, сила ${frame.variationStrength}` : '';
  lightboxCaption.textContent = `Промпт: ${selectedHistoryItem.positive || 'отсутствует'}\nМодель: ${modelName} | Seed: ${activeSeed}${variation} | Размер: ${sizeStr}${batchInfoStr}`;

  lightbox.style.display = "flex";
  document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
  document.body.style.removeProperty('overflow');
  lightbox.style.display = "none";
  lightboxImg.src = "";
  // Сбрасываем уровень зума при закрытии
  lightboxScale = 1.0;
  lightboxImg.style.transform = "scale(1)";
}

export function navigateLightbox(direction) {
  if (history.length === 0 || !selectedHistoryItem) return;
  
  let currentIndex = history.findIndex(item => item.url === selectedHistoryItem.url);
  if (currentIndex === -1) return;
  
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) {
    nextIndex = history.length - 1;
  } else if (nextIndex >= history.length) {
    nextIndex = 0;
  }
  
  const nextItem = history[nextIndex];
  selectHistoryItem(nextItem, 0);
  
  // Сбрасываем уровень зума перед открытием следующего изображения
  lightboxScale = 1.0;
  lightboxImg.style.transform = "scale(1)";
  
  openLightbox();
}
