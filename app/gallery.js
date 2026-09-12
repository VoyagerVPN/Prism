import { showNotice } from './dialogs.js';
import {frameSettings,gridImage} from './batch.js';
import { canvasPlaceholder, imageLoader, outputImage, galleryItems, metadataBar, metadataSummary, refineBtn, applyPromptBtn, applySeedBtn, hiresToggle, hiresScaleSelect, hiresDenoiseSlider, faceToggle, upscaleToggle, upscaleSelect, fullscreenBtn, lightbox, lightboxClose, lightboxPrev, lightboxNext, lightboxImg, lightboxFavorite, lightboxUseAs, batchThumbnails, reactorToggle, reactorDetection, reactorRestore, reactorVisibility, reactorCodeformerWeight, reactorIndexSource, reactorIndexInput } from './elements.js';
import { setSeedMode, setLastGeneratedSeed, reactorImageName } from './state.js';
import {galleryFavoriteState, galleryHistorySelection, galleryMediaSource, toggleGalleryFavorite} from './gallery_catalog_client.js';
import {selectedOutputImage} from './result_catalog.js';
import { imageUrl } from './api.js';

export let history = [];
export let selectedHistoryItem = null;
export let selectedBatchIndex = 0;
export let lightboxScale = 1.0;
let activeGalleryGroup=null;
let lightboxGallery = null;
let lightboxGalleryIndex = 0;
const resultKey=item=>String(item?.promptId??item?.url??'');

function syncFavoriteControl(button, state) {
  if (!button) return;
  button.disabled = !state.available;
  button.classList.toggle('active', state.favorite);
  button.setAttribute('aria-pressed', String(state.favorite));
  const label = state.favorite ? 'Убрать из избранного' : 'Добавить в избранное';
  button.setAttribute('aria-label', label);
  button.title = state.available ? label : 'Сетку батча нельзя добавить в избранное';
}

async function syncOutputFavoriteButton() {
  const button = document.getElementById('output-favorite-btn');
  if (!button) return;
  const item = selectedHistoryItem, index = selectedBatchIndex;
  if (item !== selectedHistoryItem || index !== selectedBatchIndex) return;
  syncFavoriteControl(button, galleryFavoriteState(item, index));
}

function activeLightboxSelection() {
  if (lightboxGallery?.length) return {item: lightboxGallery[lightboxGalleryIndex], index: 0};
  return {item: selectedHistoryItem, index: selectedBatchIndex};
}

async function syncLightboxFavoriteButton() {
  const selection = activeLightboxSelection();
  const current = activeLightboxSelection();
  if (selection.item !== current.item || selection.index !== current.index) return;
  syncFavoriteControl(lightboxFavorite, galleryFavoriteState(selection.item, selection.index));
}

function syncUseAsButton(button, item, index) {
  if(button)button.disabled=!galleryMediaSource(item,index);
}

async function useImageAs(item,index,button) {
  const source=galleryMediaSource(item,index);if(!source)return;
  button.disabled=true;
  try{const {openMediaAssignment}=await import('./library.js');await openMediaAssignment(source);}
  catch(error){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:`Не удалось назначить изображение: ${error.message}`}));}
  finally{syncUseAsButton(button,item,index);}
}

async function toggleFavorite(item, index, sourceButton) {
  if (!item || sourceButton?.disabled) return;
  if (sourceButton) sourceButton.disabled = true;
  try {
    await toggleGalleryFavorite(item, index);
  } catch (error) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: `Не удалось изменить избранное: ${error.message}`}));
  } finally {
    await Promise.all([syncOutputFavoriteButton(), syncLightboxFavoriteButton()]);
  }
}

function groupFor(item) {
  const settings=item.settings??item,names=new Map(),characters=[],contents=[],loras=[],boundLoras=new Set();
  const loraKey=name=>typeof name==='string'&&name&&name!=='None'?name.replaceAll('\\','/'):'';
  const addCharacter=character=>{
    if(typeof character?.name!=='string'||!character.name){loras.push(character?.lora);return;}
    names.set(`character:${character.name}`,character.name);
    const lora=loraKey(character.lora);if(lora)boundLoras.add(lora);
  };
  const addContent=content=>{
    const id=typeof content?.contentId==='string'&&content.contentId?content.contentId:`${content?.contentType??'content'}:${content?.name??''}`;
    const label=typeof content?.name==='string'&&content.name?content.name:content?.contentType??'Контент';
    names.set(`content:${id}`,label);
    for(const binding of content?.snapshot?.bindings??[]){
      const lora=binding?.kind==='lora'?loraKey(binding.name):'';if(lora)boundLoras.add(lora);
    }
  };
  const addLora=name=>{
    const lora=loraKey(name);if(!lora||boundLoras.has(lora))return;
    names.set(`lora:${lora}`,lora.split('/').pop().replace(/\.[^.]+$/,''));
  };
  if(Array.isArray(settings.positiveParts)){
    for(const part of settings.positiveParts){
      if(part?.type==='lora')loras.push(part.name);
      if(part?.type==='character')characters.push(part.character);
      if(part?.type==='content')contents.push(part);
    }
    if(settings.promptVersion!==2&&!settings.positiveParts.some(part=>part?.type==='character'))characters.push(settings.character);
  }else{
    characters.push(settings.character);
    for(const lora of settings.loras??[])loras.push(lora?.name);
  }
  characters.forEach(addCharacter);contents.forEach(addContent);loras.forEach(addLora);
  const keys=[...names.keys()].sort();
  return {key:JSON.stringify(keys),label:keys.map(key=>names.get(key)).join(' + ')||'Промпт'};
}

function selectedSettings(item = selectedHistoryItem, index = selectedBatchIndex) {
  const settings = item.settings ?? item;
  return index > 0 && settings.batchLayout === 'square-v1' ? frameSettings(settings,index-1) : settings;
}

function syncRefineButton() {
  if (!refineBtn) return;
  const hasBatch = (selectedHistoryItem?.batchUrls?.length ?? selectedHistoryItem?.outputs?.length ?? 0) > 1;
  const gridSelected = hasBatch && selectedBatchIndex === 0;
  const source = selectedOutputImage(selectedHistoryItem, selectedBatchIndex);
  const unavailableReason = !selectedHistoryItem || !source
    ? 'Сначала выберите готовый арт'
    : gridSelected
      ? 'Выберите отдельный кадр серии'
      : source.type !== 'output'
        ? 'Refine доступен только для сохранённого результата'
        : !outputImage.naturalWidth || !outputImage.naturalHeight
          ? 'Дождитесь загрузки выбранного изображения'
          : '';
  refineBtn.disabled = Boolean(unavailableReason);
  refineBtn.title = unavailableReason || 'Дорисовать выбранный кадр в высоком разрешении';
}

export function updateHistory(newHistory) {
  history = newHistory;
  setLastGeneratedSeed(history[0]?.seed);
}

export function openCatalogArt(itemId) {
  const selection = galleryHistorySelection(itemId);
  if (!selection) return false;
  const existingIndex = history.findIndex(item => item.operationId === selection.historyItem.operationId);
  if (existingIndex >= 0) history[existingIndex] = selection.historyItem;
  else history = [selection.historyItem, ...history].slice(0, 15);
  renderGallery();
  selectHistoryItem(selection.historyItem, selection.batchIndex);
  return true;
}

export function displayOutputImage(job) {
  const existing = history.find(item => item.promptId === job.promptId);
  if (existing) return;
  const gridUrl = job.gridOutput ? imageUrl(job.gridOutput) : null;
  const urls = job.outputs.map(imageUrl).filter(url=>url!==gridUrl);
  if (!urls.length) {
    window.dispatchEvent(new CustomEvent('dashboard-warning', { detail: 'Задание завершено, но SaveImage не вернул файлов.' }));
    return;
  }
  const settings = structuredClone(job.settings);
  const item = {
    ...settings, version: 3, promptId: job.promptId, settings,
    workflow: structuredClone(job.workflow), outputs: structuredClone(job.outputs),
    url: gridUrl ?? urls[0], gridUrl, batchUrls: urls.length > 1 ? urls : [], timestamp: job.finishedAt ?? Date.now(),
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
  window.dispatchEvent(new CustomEvent('prism-output-created', {detail: structuredClone(item)}));
}

export function renderGallery() {
  const galleryBar = document.querySelector(".gallery-bar");
  if (history.length === 0) {
    galleryBar.style.display = "none";
    galleryItems.replaceChildren();document.getElementById('gallery-groups')?.replaceChildren();activeGalleryGroup=null;
    return;
  }
  galleryBar.style.display = "flex";
  const groups=new Map();
  for(const item of history){
    const group=groupFor(item);
    if(!groups.has(group.key))groups.set(group.key,{...group,items:[]});
    groups.get(group.key).items.push(item);
  }
  if(!groups.has(activeGalleryGroup))activeGalleryGroup=groups.keys().next().value;
  const groupBar=document.getElementById('gallery-groups');groupBar.replaceChildren();
  for(const group of groups.values()){
    const button=document.createElement('button');button.type='button';button.className='gallery-group';
    button.dataset.groupKey=group.key;
    button.setAttribute('aria-label',`Группа: ${group.label}`);button.setAttribute('aria-pressed',String(group.key===activeGalleryGroup));button.setAttribute('aria-controls','gallery-items');button.title=group.label;
    const cover=document.createElement('img');cover.src=group.items[0].url;cover.alt='';cover.loading='lazy';
    const label=document.createElement('span');label.className='gallery-group-label';label.textContent=group.label;
    const count=document.createElement('span');count.className='gallery-group-count';count.textContent=group.items.length;count.title='Результатов в группе';
    button.append(cover,label,count);
    button.onclick=()=>{activeGalleryGroup=group.key;renderGallery();[...groupBar.children].find(child=>child.dataset.groupKey===group.key)?.focus({preventScroll:true});};groupBar.append(button);
  }
  
  galleryItems.innerHTML = "";
  groups.get(activeGalleryGroup).items.forEach(item => {
    const index=history.indexOf(item);
    const thumb = document.createElement("button");
    thumb.type = 'button';
    thumb.setAttribute('aria-label', `Результат ${index + 1}, Seed ${(item.settings??item).seed ?? 'неизвестен'}`);
    thumb.dataset.resultId=resultKey(item);
    const selected=selectedHistoryItem&&resultKey(selectedHistoryItem)===resultKey(item);
    thumb.className = "gallery-thumb" + (selected ? " active" : "");
    thumb.setAttribute('aria-pressed',String(Boolean(selected)));
    thumb.style.backgroundImage = `url('${item.url}')`;
    if (item.batchUrls?.length > 1) {
      const count = document.createElement('span');
      count.className = 'history-count';
      count.textContent = `${Math.ceil(Math.sqrt(item.batchUrls.length))}×${Math.ceil(Math.sqrt(item.batchUrls.length))}`;
      thumb.append(count);
    }
    thumb.addEventListener("click", () => {
      selectHistoryItem(item,0,{restorePrompt:true});
    });
    galleryItems.appendChild(thumb);
  });
}

export function selectHistoryItem(item, batchIndex = 0, {restorePrompt=false} = {}) {
  selectedHistoryItem = item;
  selectedBatchIndex = batchIndex;
  void syncOutputFavoriteButton();
  syncUseAsButton(document.getElementById('output-use-as-btn'),item,batchIndex);
  const group=groupFor(item);
  if(activeGalleryGroup!==group.key){activeGalleryGroup=group.key;renderGallery();}
  
  Array.from(galleryItems.children).forEach(thumb => {
    thumb.classList.toggle('active', thumb.dataset.resultId===resultKey(item));
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
  const showLegacyGrid = showGrid && !item.gridUrl;
  grid.style.gridTemplateColumns = `repeat(${Math.ceil(Math.sqrt(item.batchUrls?.length || 1))},minmax(0,1fr))`;
  grid.style.display = showLegacyGrid ? 'grid' : 'none';
  outputImage.style.display = showLegacyGrid ? 'none' : 'block';
  outputImage.src = displayUrl;
  syncRefineButton();
  if (showLegacyGrid) {
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
      button.addEventListener('click', () => selectHistoryItem(item, index + 1,{restorePrompt:true}));
      grid.appendChild(button);
    });
  }
  document.getElementById('download-btn').disabled = false;
  document.getElementById('download-btn').title = showGrid ? 'Скачать сетку PNG' : 'Скачать выбранный кадр';
  const repeatLabel=showGrid || (hasBatch && item.settings?.batchLayout !== 'square-v1') ? 'Повторить серию' : 'Повторить кадр';
  const repeatButton = document.getElementById('repeat-btn');
  repeatButton.disabled = !item.workflow;
  repeatButton.title = item.workflow ? repeatLabel : 'У старой записи не сохранён точный граф';
  repeatButton.setAttribute('aria-label', repeatLabel);
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
      selectHistoryItem(item, 0,{restorePrompt:true});
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
        selectHistoryItem(item, idx,{restorePrompt:true});
      });
      batchThumbnails.appendChild(thumb);
    });
  } else {
    batchThumbnails.style.display = "none";
    batchThumbnails.innerHTML = "";
  }
  
  metadataBar.style.display = "block";
  
  let loraStr = item.loras && item.loras.length > 0 
    ? ` | LoRA: ${item.loras.map(l => `${l.name} (${l.strength})`).join(", ")}` 
    : "";
  
  let charStr = item.character ? ` | Персонаж: ${item.character.name}` : "";
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
  const renderMetadata = sizeStr => {
    metadataSummary.textContent = `Модель: ${(item.checkpoint ?? "Неизвестно").split("/").pop()} | Steps: ${item.steps} | CFG: ${item.cfg} | Seed${seriesSeed ? ' серии' : ''}: ${activeSeed}${variationInfo}${sizeStr}${charStr}${loraStr}${batchInfoStr}`;
  };
  renderMetadata('');
  const expectedUrl = new URL(displayUrl,document.baseURI).href;
  outputImage.onload=()=>{
    if(!showLegacyGrid&&outputImage.naturalWidth>0&&outputImage.src===expectedUrl)
      renderMetadata(` | Размер: ${outputImage.naturalWidth}x${outputImage.naturalHeight}`);
  };
  if(outputImage.complete)outputImage.onload();
  
  applyPromptBtn.disabled = false;
  applySeedBtn.disabled = showGrid || seriesSeed;
  applySeedBtn.title = showGrid ? 'Сначала выберите кадр в сетке' : seriesSeed ? 'У старой серии сохранён только общий seed' : 'Взять seed выбранного кадра';
  fullscreenBtn.style.display = showLegacyGrid ? "none" : "block";
  if(restorePrompt)window.dispatchEvent(new CustomEvent('restore-history-prompt',{detail:structuredClone(settings)}));
}

export function initGalleryEvents() {
  const outputFavorite = document.getElementById('output-favorite-btn');
  const outputUseAs = document.getElementById('output-use-as-btn');
  outputFavorite.addEventListener('click', () => { void toggleFavorite(selectedHistoryItem, selectedBatchIndex, outputFavorite); });
  outputUseAs.addEventListener('click',()=>{void useImageAs(selectedHistoryItem,selectedBatchIndex,outputUseAs);});
  lightboxFavorite.addEventListener('click', event => {
    event.stopPropagation();
    const {item, index} = activeLightboxSelection();
    void toggleFavorite(item, index, lightboxFavorite);
  });
  lightboxUseAs.addEventListener('click',event=>{event.stopPropagation();const {item,index}=activeLightboxSelection();void useImageAs(item,index,lightboxUseAs);});
  window.addEventListener('prism-gallery-catalog-change', () => {
    void syncOutputFavoriteButton();
    syncUseAsButton(outputUseAs,selectedHistoryItem,selectedBatchIndex);
    if (lightbox.style.display === 'flex'){void syncLightboxFavoriteButton();const {item,index}=activeLightboxSelection();syncUseAsButton(lightboxUseAs,item,index);}
  });
  window.addEventListener('prism-open-catalog-art', event => {
    if (!openCatalogArt(event.detail?.itemId)) {
      window.dispatchEvent(new CustomEvent('dashboard-warning', {detail: 'Не удалось восстановить операцию выбранного арта.'}));
    }
  });
  outputImage.addEventListener('load', syncRefineButton);
  refineBtn.addEventListener('click', () => {
    const source = selectedOutputImage(selectedHistoryItem, selectedBatchIndex);
    if (!source || source.type !== 'output' || !outputImage.naturalWidth || !outputImage.naturalHeight) return;
    window.dispatchEvent(new CustomEvent('refine-image', {detail: {
      settings: {
        ...structuredClone(selectedSettings()),
        hiresScale: Number(hiresScaleSelect.value),
        hiresDenoise: Number(hiresDenoiseSlider.value),
        upscaleSelect: upscaleSelect.value,
      },
      source: {...structuredClone(source), width: outputImage.naturalWidth, height: outputImage.naturalHeight},
    }}));
  });
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
    let url, temporary=false;
    try {
      temporary = isGrid && !item.gridUrl;
      url = temporary ? URL.createObjectURL(await gridImage(item.batchUrls)) : index > 0 ? item.batchUrls[index-1] : item.url;
      const link = document.createElement('a');
      link.href = url; link.download = `prism_${isGrid ? 'grid' : 'frame'}_${Date.now()}.png`;
      document.body.append(link); link.click(); link.remove();
    } catch (error) { await showNotice(`Не удалось скачать изображение: ${error.message}`); }
    finally { if (temporary && url) setTimeout(() => URL.revokeObjectURL(url),1000); }
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
    const editing = typeof e.target?.closest === 'function' && Boolean(e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !editing) {
      const lightboxOpen = lightbox.style.display === 'flex';
      if (lightboxOpen || document.body.dataset.appView !== 'gallery') {
        const {item, index} = lightboxOpen ? activeLightboxSelection() : {item: selectedHistoryItem, index: selectedBatchIndex};
        if (item) { e.preventDefault(); void toggleFavorite(item, index, lightboxOpen ? lightboxFavorite : outputFavorite); }
      }
      return;
    }
    if (lightbox.style.display === "flex") {
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateLightbox(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
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

function showLightboxItem(item, batchIndex = 0) {
  let activeUrl = item.url;
  if (batchIndex > 0 && item.batchUrls && item.batchUrls[batchIndex - 1]) {
    activeUrl = item.batchUrls[batchIndex - 1];
  }
  
  // Сбрасываем уровень зума при открытии
  lightboxScale = 1.0;
  lightboxImg.style.transform = "scale(1)";
  lightboxImg.src=activeUrl;

  lightbox.style.display = "flex";
  document.body.style.overflow = 'hidden';
  void syncLightboxFavoriteButton();
  const selection=activeLightboxSelection();syncUseAsButton(lightboxUseAs,selection.item,selection.index);
}

export function openLightbox() {
  if (!selectedHistoryItem) return;
  lightboxGallery = null;
  showLightboxItem(selectedHistoryItem, selectedBatchIndex);
}

export function openLightboxGallery(items, itemId) {
  lightboxGallery = items.map(item => ({
    promptId: item.id,
    url: imageUrl(item.image),
    outputs: [item.image],
    settings: item.settings ?? {},
    timestamp: item.createdAt,
  }));
  lightboxGalleryIndex = Math.max(0, lightboxGallery.findIndex(item => item.promptId === itemId));
  if (lightboxGallery.length) showLightboxItem(lightboxGallery[lightboxGalleryIndex]);
}

export function closeLightbox() {
  document.body.style.removeProperty('overflow');
  lightbox.style.display = "none";
  lightboxImg.src = "";
  // Сбрасываем уровень зума при закрытии
  lightboxScale = 1.0;
  lightboxImg.style.transform = "scale(1)";
  lightboxGallery = null;
}

export function navigateLightbox(direction) {
  if (lightboxGallery?.length) {
    lightboxGalleryIndex = (lightboxGalleryIndex + direction + lightboxGallery.length) % lightboxGallery.length;
    showLightboxItem(lightboxGallery[lightboxGalleryIndex]);
    return;
  }
  if (history.length === 0 || !selectedHistoryItem) return;
  // Единая последовательность проходит кадры серий и все группы LoRA.
  const images = history.flatMap(item=>{
    if (!item.batchUrls?.length || item.batchUrls.length === 1) return [{item,index:0}];
    const frames = item.batchUrls.map((_,index)=>({item,index:index+1}));
    return item.gridUrl ? [{item,index:0},...frames] : frames;
  });
  const currentIndex = images.findIndex(({item,index})=>resultKey(item)===resultKey(selectedHistoryItem)&&index===selectedBatchIndex);
  if (currentIndex === -1) return;
  const next = images[(currentIndex + direction + images.length) % images.length];
  selectHistoryItem(next.item, next.index,{restorePrompt:true});
  openLightbox();
}
