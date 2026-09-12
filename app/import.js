import {makeDialogBackdropDismissible} from './popup_behavior.js';
import {createEditableChoice} from './editable_choice.js';
import {syncSelectControls} from './controls.js';
import {readPreferences} from './preferences.js';
import {CONTENT_TYPES} from './content_catalog.js';
import {persistContentImport} from './content_registry.js';
import {persistImportedCharacter} from './characters.js';
import {contentCategories,contentTypeOf} from './lora_categories.js';

let contentTargetsProvider=()=>[];
export function setImportContentTargetsProvider(provider) {contentTargetsProvider=typeof provider==='function'?provider:()=>[];}

const labels = {Other: 'Прочее', Character: 'Персонаж', Style: 'Стиль', Clothing: 'Одежда', Pose: 'Поза', Object: 'Предмет', Background: 'Фон', Utility: 'Эффект / обработка', Model: 'Модель'};

export function setupModelImport(refresh) {
  const dialog = document.querySelector('#model-import-dialog');
  makeDialogBackdropDismissible(dialog);
  const input = document.querySelector('#model-import-file');
  const form = document.querySelector('#model-import-form');
  const fields = document.querySelector('#import-fields');
  const kind = document.querySelector('#import-kind');
  const baseHost = document.querySelector('#import-base-field') ?? document.querySelector('#import-base');
  const category = document.querySelector('#import-category');
  const status = document.querySelector('#import-status');
  const save = document.querySelector('#import-save');
  const cancel = document.querySelector('#import-cancel');
  const progress = document.querySelector('#import-progress');
  const destination = document.querySelector('#import-destination');
  const categoryLabel = fields.querySelector('label[for="import-category"]');
  const entityModeLabel=document.createElement('label'),entityMode=document.createElement('select');
  entityMode.id='import-entity-mode';entityModeLabel.htmlFor=entityMode.id;entityModeLabel.textContent='Что сделать с источником';
  entityMode.replaceChildren(new Option('Создать новую сущность','create'),new Option('Привязать к существующей','attach'),new Option('Оставить во входящих','inbox'));entityModeLabel.append(entityMode);
  const contentTypeLabel=document.createElement('label'),contentType=document.createElement('select');
  contentType.id='import-content-type';contentTypeLabel.htmlFor=contentType.id;contentTypeLabel.textContent='Тип содержимого';
  contentType.replaceChildren(...CONTENT_TYPES.map(type=>new Option(contentCategories[type]??type,type)));contentTypeLabel.append(contentType);
  const entityTargetLabel=document.createElement('label'),entityTarget=document.createElement('select');
  entityTarget.id='import-entity-target';entityTargetLabel.htmlFor=entityTarget.id;entityTargetLabel.textContent='Существующая сущность';entityTargetLabel.append(entityTarget);entityTarget.hidden=true;entityTargetLabel.hidden=true;
  const contentNameLabel=document.createElement('label'),contentName=document.createElement('input');
  contentName.id='import-content-name';contentName.maxLength=500;contentName.required=true;contentNameLabel.htmlFor=contentName.id;contentNameLabel.textContent='Название в библиотеке';contentNameLabel.append(contentName);
  const categoryAnchor=categoryLabel??category;
  fields.insertBefore(entityModeLabel,categoryAnchor);fields.insertBefore(contentTypeLabel,categoryAnchor);fields.insertBefore(contentNameLabel,categoryAnchor);fields.insertBefore(entityTargetLabel,categoryAnchor);
  category.hidden=true;if(categoryLabel)categoryLabel.hidden=true;
  let file;
  let analysis;
  let uploading = false;
  let uploadRequest = null;
  let revision = 0;
  let baseName = '';
  let knownBases = [];
  let knownEntities = [];
  const baseChoice = createEditableChoice({id:'import-base',label:'Базовая модель',placeholder:'Выберите или впишите название',maxLength:120,filter:true,scrollContainer:dialog,
    readName:()=>baseName,
    commitName:value=>{baseName=value;updatePath();return true;},
    options:()=>knownBases.map(value=>({value,label:value,selected:value===baseName})),
    choose:value=>{baseName=value;updatePath();},
  });
  const base = baseChoice.input;
  base.required = true;
  baseHost.replaceWith(baseChoice.root);
  const options = (select, values, selected) => {
    select.replaceChildren(new Option('Уточните…', ''), ...values.map(value => new Option(labels[value] ?? value, value)));
    select.value = selected ?? '';
  };
  const updatePath = () => {
    const root = {loras: 'Lora', checkpoints: 'StableDiffusion', diffusion_models: 'DiffusionModels'}[kind.value];
    destination.textContent = root && baseName && category.value && file ? 'Источник будет добавлен в библиотеку.' : 'Для сохранения уточните недостающие поля.';
  };
  const updateEntityIntent=()=>{
    const attaching=entityMode.value==='attach';
    const creating=entityMode.value==='create';
    contentTypeLabel.hidden=entityMode.value==='inbox';contentType.hidden=entityMode.value==='inbox';contentType.disabled=!creating;
    contentName.hidden=!creating;contentNameLabel.hidden=!creating;contentName.disabled=!creating;
    entityTarget.hidden=!attaching;entityTargetLabel.hidden=!attaching;entityTarget.required=attaching;
    const previousTarget=entityTarget.value;entityTarget.replaceChildren(...knownEntities.map(entity=>new Option(entity.name,entity.id)));
    if([...entityTarget.options].some(option=>option.value===previousTarget))entityTarget.value=previousTarget;
    if(attaching&&entityTarget.options.length){
      const selected=knownEntities.find(entity=>entity.id===entityTarget.value)??knownEntities[0];
      if(CONTENT_TYPES.includes(selected.type))contentType.value=selected.type;
      const backendCategory=['Effect','Processing'].includes(selected.type)?'Utility':selected.type;
      if([...category.options].some(option=>option.value===backendCategory))category.value=backendCategory;
    }
    if(creating){
      const backendCategory=['Effect','Processing'].includes(contentType.value)?'Utility':contentType.value;
      if([...category.options].some(option=>option.value===backendCategory))category.value=backendCategory;
    }
    if(entityMode.value==='inbox'&&[...category.options].some(option=>option.value==='Other'))category.value='Other';
    save.disabled=fields.disabled||(attaching&&!entityTarget.options.length)||(creating&&!contentType.value);updatePath();
  };
  const updateCategory = () => {
    options(category, kind.value === 'loras' ? analysis.categories : ['Model'], kind.value === 'loras' ? analysis.category ?? 'Other' : 'Model');
    updatePath();
  };
  async function upload() {
    if (uploading || !file || !baseChoice.commit() || !form.reportValidity()) return;
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
        uploadRequest = xhr;
        xhr.open('POST', '/prism/import/upload');
        xhr.responseType = 'json';
        xhr.timeout = 120000;
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) progress.value = event.loaded / event.total * 100;
          status.textContent = progress.value >= 100 ? 'Проверка и сохранение файла…' : `Загрузка: ${Math.round(progress.value)}%`;
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.error ?? `Ошибка загрузки: HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Соединение прервано. Проверьте библиотеку перед повтором: файл мог сохраниться.'));
        xhr.ontimeout = () => reject(new Error('Сервер не ответил за 2 минуты. Проверьте библиотеку перед повтором: файл мог сохраниться.'));
        xhr.onabort = () => reject(new Error('Загрузка отменена.'));
        xhr.send(data);
      });
      const selectedEntity=knownEntities.find(entity=>entity.id===entityTarget.value);
      const selectedContentType=entityMode.value==='attach'?selectedEntity?.type:entityMode.value==='inbox'?null:contentType.value;
      const detail={action:entityMode.value,contentType:selectedContentType,targetId:entityMode.value==='attach'?entityTarget.value:null,source:{name:result.name,path:result.path}};
      let assignmentWarning='';
      if(kind.value==='loras'&&entityMode.value!=='inbox'){
        const intent={action:entityMode.value,contentType:selectedContentType,name:contentName.value,base:base.value,target:selectedEntity,source:detail.source};
        try{
          if(selectedContentType==='Character')await persistImportedCharacter(intent);
          else await persistContentImport(intent);
          window.dispatchEvent(new window.CustomEvent('prism-content-imported',{detail}));
        }catch(error){
          assignmentWarning=`Назначение не сохранено: ${error.message}`;
          try{
            const response=await fetch('/prism/lora-library/category',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:result.name,category:'Other'}),signal:AbortSignal.timeout(20000)});
            const data=await response.json();if(!response.ok)throw new Error(data.error??`HTTP ${response.status}`);
            assignmentWarning+=' · Источник оставлен во входящих.';
          }catch(rollbackError){assignmentWarning+=` · Не удалось перенести во входящие: ${rollbackError.message}.`;}
          window.dispatchEvent(new window.CustomEvent('prism-content-import-failed',{detail:{...detail,error:assignmentWarning}}));
        }
      }else if(kind.value==='loras')window.dispatchEvent(new window.CustomEvent('prism-content-imported',{detail}));
      const autoMetadata = kind.value === 'loras' && readPreferences().autoCivitaiMetadata;
      status.textContent = `Сохранено: ${result.name}`;
      if (result.warning) status.textContent += ` · ${result.warning}`;
      if(assignmentWarning)status.textContent+=` · ${assignmentWarning}`;
      destination.textContent = assignmentWarning?'Источник сохранён и доступен во входящих.':'Источник сохранён в библиотеке.';
      file = null;
      cancel.textContent = 'Готово';
      cancel.disabled = false;
      try { await refresh(); } catch (error) { status.textContent += ` · Список не обновлён: ${error.message}. Нажмите обновление моделей.`; }
      if (autoMetadata) {
        status.textContent += ' · Метаданные CivitAI: загрузка…';
        try {
          const response = await fetch('/prism/lora-library/lookup', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:result.name}),signal:AbortSignal.timeout(90000)});
          const metadata = await response.json();
          if (!response.ok) throw new Error(metadata.error ?? `HTTP ${response.status}`);
          status.textContent = `Сохранено: ${result.name}${assignmentWarning?` · ${assignmentWarning}`:''} · ${metadata.metadataStatus === 'partial' ? metadata.warning : 'Метаданные CivitAI загружены'}`;
        } catch (error) {
          status.textContent = `Сохранено: ${result.name}${assignmentWarning?` · ${assignmentWarning}`:''} · Метаданные CivitAI не загружены: ${error.message}. Повторите кнопкой обновления в карточке.`;
        }
        try { await refresh(); } catch { /* Первый refresh уже сообщил о проблеме списка. */ }
      }
    } catch (error) {
      status.textContent = error.message;
      fields.disabled = false;
      save.disabled = false;
    } finally {
      uploadRequest = null;
      uploading = false;
      cancel.disabled = false;
    }
  }
  async function inspect(files) {
    if (uploading || dialog.open) return;
    const current = ++revision;
    file = files[0];
    fields.disabled = true;
    save.disabled = true;
    progress.hidden = true;
    progress.value = 0;
    cancel.textContent = 'Отмена';
    document.querySelector('#import-filename').textContent = file?.name ?? '';
    document.querySelector('#import-evidence').textContent = '';
    const summary = document.querySelector('#import-model-summary');
    if (summary) summary.textContent = '';
    destination.textContent = '';
    status.textContent = 'Чтение метаданных…';
    kind.value = '';
      baseName = '';knownBases = [];baseChoice.sync();
      contentName.value=file.name.replace(/\.safetensors$/i,'').replace(/[_-]+/g,' ').trim();
    category.replaceChildren();
    syncSelectControls();
    dialog.showModal();
    document.querySelector('#model-import-title')?.focus({preventScroll:true});
    try {
      if (files.length !== 1 || !file?.name.toLowerCase().endsWith('.safetensors')) throw new Error('Выберите один файл .safetensors.');
      if (file.size < 10 || file.size > 32 * 1024 ** 3) throw new Error('Допустимый размер файла: до 32 ГБ.');
      const prefix = new DataView(await file.slice(0, 8).arrayBuffer());
      const size = Number(prefix.getBigUint64(0, true));
      if (size < 2 || size > 16 * 1024 ** 2 || size + 8 > file.size) throw new Error('Некорректный заголовок safetensors.');
      const header = JSON.parse(await file.slice(8, 8 + size).text());
      const response = await fetch('/prism/import/analyze', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({header, name: file.name}), signal: AbortSignal.timeout(30000)});
      const result = await response.json();
      if (current !== revision) return;
      if (!response.ok) throw new Error(result.error ?? 'Не удалось прочитать метаданные.');
      analysis = result;
      kind.value = result.kind ?? '';
      knownBases = result.bases;
      const importTargets=Array.isArray(result.entities)?result.entities:contentTargetsProvider();
      knownEntities=importTargets.filter(entity=>entity&&typeof entity.id==='string'&&typeof entity.name==='string'&&typeof entity.type==='string');
      baseName = result.base ?? '';
      baseChoice.sync();
      updateCategory();
      entityMode.value=result.category&&result.category!=='Other'?'create':'inbox';
      const inferredType=contentTypeOf({category:result.category??'Other',name:file.name,title:file.name,tags:[]});
      if(CONTENT_TYPES.includes(inferredType))contentType.value=inferredType;
      entityMode.querySelector('[value="attach"]').disabled=!knownEntities.length;updateEntityIntent();
      if (summary) summary.textContent = [result.base?`База: ${result.base}`:'База не указана',result.trainingModel?`Обучена на: ${result.trainingModel}`:''].filter(Boolean).join(' · ');
      document.querySelector('#import-evidence').textContent = Object.entries(result.evidence).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'В метаданных нет сведений о базе и назначении.';
      status.textContent = result.base ? (result.category||result.kind!=='loras'?'База прочитана из файла.':'База прочитана из файла. Назначение не указано — сохраняем в «Прочее».') : 'База не указана в файле. Выберите ранее добавленную или впишите свою.';
      fields.disabled = false;
      save.disabled = false;
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
  category.addEventListener('change', updatePath);
  entityMode.addEventListener('change',updateEntityIntent);
  entityTarget.addEventListener('change',updateEntityIntent);
  contentType.addEventListener('change',updateEntityIntent);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', () => { if (uploading) uploadRequest?.abort(); });
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
