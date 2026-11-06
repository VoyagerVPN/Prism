import {makeDialogBackdropDismissible} from './popup_behavior.js';
import {createEditableChoice} from './editable_choice.js';
import {syncSelectControls} from './controls.js';
import {readPreferences} from './preferences.js';
import {CONTENT_TYPES} from './content_catalog.js';
import {persistContentImport} from './content_registry.js';
import {getSavedCharacters,getCharacterUniverses,persistImportedCharacter} from './characters.js';
import {categoryLabel} from './lora_categories.js';
import {translate as tr} from './i18n.js';

let contentTargetsProvider=()=>[];
export function setImportContentTargetsProvider(provider) {contentTargetsProvider=typeof provider==='function'?provider:()=>[];}

const purposes={
  Character:{title:'Добавить персонажа',name:'Имя персонажа',attach:'Добавить модель к персонажу…',target:'Персонаж'},
  Concept:{title:'Добавить концепт',name:'Название концепта',attach:'Дополнить существующий концепт…',target:'Концепт'},
  Style:{title:'Добавить стиль',name:'Название стиля',attach:'Дополнить существующий стиль…',target:'Стиль'},
  Clothing:{title:'Добавить одежду',name:'Название одежды',attach:'Дополнить сохранённую одежду…',target:'Одежда'},
  Pose:{title:'Добавить позу',name:'Название позы',attach:'Дополнить сохранённую позу…',target:'Поза'},
  Object:{title:'Добавить предмет',name:'Название предмета',attach:'Дополнить существующий предмет…',target:'Предмет'},
  Background:{title:'Добавить фон',name:'Название фона',attach:'Дополнить существующий фон…',target:'Фон'},
  Effect:{title:'Добавить эффект',name:'Название эффекта',attach:'Дополнить существующий эффект…',target:'Эффект'},
  Processing:{title:'Добавить обработку',name:'Название обработки',attach:'Дополнить существующую обработку…',target:'Обработка'},
};
const backendCategory=type=>['Effect','Processing'].includes(type)?'Utility':type==='Concept'?'Other':type;
const purposeFor=type=>purposes[type]&&Object.fromEntries(Object.entries(purposes[type]).map(([key,value])=>[key,tr(`import.purposes.${type}.${key}`,value)]));

export function setupModelImport(refresh) {
  const $=id=>document.getElementById(id);
  const dialog=$('model-import-dialog'),input=$('model-import-file'),form=$('model-import-form');
  const fields=$('import-fields'),kind=$('import-kind'),category=$('import-category');
  const contentType=$('import-content-type'),contentName=$('import-content-name'),target=$('import-entity-target');
  const status=$('import-status'),save=$('import-save'),cancel=$('import-cancel'),progress=$('import-progress');
  makeDialogBackdropDismissible(dialog);
  contentType.replaceChildren(new Option(tr('import.choosePurpose','Выберите назначение'),''),...CONTENT_TYPES.map(type=>new Option(categoryLabel(type),type)));
  for(const type of CONTENT_TYPES){
    const button=document.createElement('button');button.type='button';button.dataset.importType=type;
    const label=tr(`import.purposes.${type}.label`,purposes[type].title.replace('Добавить ',''));
    button.textContent=label[0].toUpperCase()+label.slice(1);button.setAttribute('aria-pressed','false');
    button.onclick=()=>{contentType.value=type;attaching=false;renderIntent();};
    $('import-purpose-options').append(button);
  }
  let file,headerMetadata={},installed=null;
  let uploading=false,uploadRequest=null,revision=0,baseName='',knownBases=[],knownEntities=[],attaching=false,universeName='';
  const baseChoice=createEditableChoice({
    id:'import-base',label:tr('import.base','Базовая модель'),placeholder:tr('import.chooseBase','Выберите или впишите название'),maxLength:120,filter:true,scrollContainer:dialog,
    readName:()=>baseName,commitName:value=>{baseName=value;renderIntent();return true;},
    options:()=>knownBases.map(value=>({value,label:value,selected:value===baseName})),
    choose:value=>{baseName=value;renderIntent();},
  });
  baseChoice.input.required=true;
  ($('import-base-field')??$('import-base')).replaceWith(baseChoice.root);
  const universeChoice=createEditableChoice({
    id:'import-universe',label:tr('import.universe','Вселенная'),placeholder:tr('import.chooseUniverse','Укажите вселенную'),maxLength:500,filter:true,scrollContainer:dialog,
    readName:()=>universeName,commitName:value=>{universeName=value;return true;},
    options:()=>getCharacterUniverses().map(value=>({value,label:value,selected:value===universeName})),
    choose:value=>{universeName=value;},
  });
  $('import-universe').replaceWith(universeChoice.root);
  const metadataText=key=>typeof headerMetadata[key]==='string'?headerMetadata[key]:'';
  const matchingTargets=()=>knownEntities.filter(entity=>entity.type===contentType.value
    &&(entity.type!=='Character'||Object.hasOwn(getSavedCharacters(),entity.characterName)));
  const targetEntity=()=>matchingTargets().find(entity=>entity.id===target.value);
  const updateTargets=()=>{
    const previous=target.value;
    target.replaceChildren(new Option(tr('import.choose','Выберите…'),''),...matchingTargets().map(entity=>new Option(entity.name,entity.id)));
    if([...target.options].some(option=>option.value===previous))target.value=previous;
  };
  function renderIntent(){
    const lora=kind.value==='loras',purpose=lora?purposeFor(contentType.value):null;
    const choosing=lora&&!purpose;
    $('model-import-title').textContent=attaching&&purpose?purpose.attach.replace('…',''):lora?(purpose?.title??tr('import.addLora','Добавить LoRA')):tr('import.addModel','Добавить модель');
    $('import-purpose').hidden=!lora;
    $('import-purpose-picker').hidden=!lora||Boolean(purpose);
    $('import-purpose-name').textContent=purpose?.target??'';
    $('import-purpose-change').hidden=!purpose||Boolean(installed);
    for(const button of $('import-purpose-options').children)button.setAttribute('aria-pressed',String(button.dataset.importType===contentType.value));
    $('import-card-fields').hidden=!purpose||attaching;
    contentName.disabled=!purpose||attaching;
    contentName.required=Boolean(purpose)&&!attaching;
    $('import-content-name-label').textContent=purpose?.name??tr('import.name','Название');
    $('import-character-fields').hidden=contentType.value!=='Character'||attaching;
    for(const id of ['import-universe','import-appearance','import-outfit'])$(id).disabled=contentType.value!=='Character'||attaching;
    $('import-trigger').disabled=!purpose||attaching;
    $('import-attach').hidden=!purpose||attaching||!matchingTargets().length;
    $('import-attach').textContent=purpose?.attach??'';
    $('import-target-fields').hidden=!attaching||!purpose;
    $('import-target-label').textContent=purpose?.target??'';
    target.disabled=!attaching;target.required=attaching;
    const selected=targetEntity();
    const previousModel=selected?.type==='Character'?getSavedCharacters()[selected.characterName]?.lora:null;
    $('import-target-note').textContent=previousModel&&previousModel!=='None'
      ?tr('import.replaceNote','Новая модель заменит прежнюю модель персонажа. Имя, внешность и одежда сохранятся.')
      :attaching?tr('import.attachNote','Модель будет подключена к выбранной карточке.'):'';
    const categoryName=lora?backendCategory(contentType.value):'Model';
    category.replaceChildren(new Option(categoryName,categoryName));category.value=categoryName;
    save.textContent=installed?tr('import.retry','Повторить сохранение карточки'):attaching
      ?(previousModel&&previousModel!=='None'?tr('import.replaceModel','Заменить модель персонажа'):tr('import.attachModel','Подключить модель'))
      :choosing?tr('import.choosePurpose','Выберите назначение'):purpose?.title??tr('import.addModel','Добавить модель');
    save.disabled=uploading||fields.disabled||!kind.value||!baseName||choosing||(attaching&&!selected);
    if(installed){kind.disabled=true;baseChoice.input.disabled=true;}
    $('import-model-summary').textContent=[lora?'LoRA':kind.value?tr('import.model','Модель'):tr('import.unknownType','Тип файла не определён'),baseName?tr('import.baseValue','База: '+baseName,{name:baseName}):tr('import.baseRequired','Укажите базовую модель')].join(' · ');
    $('import-destination').textContent=choosing?tr('import.chooseContent','Выберите, что вы хотите добавить в библиотеку.'):purpose
      ?(contentType.value==='Character'?tr('import.openCharacter','После сохранения откроется карточка персонажа.'):tr('import.openCard','После сохранения откроется добавленная карточка в библиотеке.'))
      :tr('import.modelReady','После добавления модель можно выбрать для генерации.');
    syncSelectControls();
  }
  const refreshLanguage=()=>{
    const selected=contentType.value;
    contentType.replaceChildren(new Option(tr('import.choosePurpose','Выберите назначение'),''),...CONTENT_TYPES.map(type=>new Option(categoryLabel(type),type)));
    contentType.value=selected;
    for(const button of $('import-purpose-options').children){const type=button.dataset.importType,label=tr(`import.purposes.${type}.label`,purposes[type].title.replace('Добавить ',''));button.textContent=label[0].toUpperCase()+label.slice(1);}
    baseChoice.setLabels({label:tr('import.base','Базовая модель'),placeholder:tr('import.chooseBase','Выберите или впишите название')});
    universeChoice.setLabels({label:tr('import.universe','Вселенная'),placeholder:tr('import.chooseUniverse','Укажите вселенную')});
    cancel.textContent=tr('import.cancel','Отмена');
    if(dialog.open&&!fields.disabled){updateTargets();renderIntent();}
  };
  window.addEventListener('prism-language-changed',refreshLanguage);
  const uploadFile=()=>new Promise((resolve,reject)=>{
    const data=new FormData();data.append('kind',kind.value);data.append('base',baseName);data.append('category',category.value);data.append('file',file);
    const xhr=new XMLHttpRequest();uploadRequest=xhr;xhr.open('POST','/prism/import/upload');xhr.responseType='json';xhr.timeout=120000;
    xhr.upload.onprogress=event=>{
      if(event.lengthComputable)progress.value=event.loaded/event.total*100;
      const percent=Math.round(progress.value);
      status.textContent=progress.value>=100?tr('import.checking','Проверка файла…'):tr('import.uploading','Загрузка: '+percent+'%',{percent});
    };
    xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve(xhr.response):reject(new Error(xhr.response?.error??tr('import.uploadError','Ошибка загрузки: HTTP '+xhr.status,{status:xhr.status})));
    xhr.onerror=()=>reject(new Error(tr('import.network','Соединение прервано. Файл мог сохраниться; проверьте библиотеку перед повтором.')));
    xhr.ontimeout=()=>reject(new Error(tr('import.timeout','Сервер не ответил. Файл мог сохраниться; проверьте библиотеку перед повтором.')));
    xhr.onabort=()=>reject(new Error(tr('import.cancelled','Загрузка отменена.')));
    xhr.send(data);
  });
  async function enrich(name){
    try{
      const response=await fetch('/prism/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(90000)});
      const metadata=await response.json();
      if(!response.ok)throw new Error(metadata.error??'HTTP '+response.status);
      await refresh();
    }catch(error){window.dispatchEvent(new window.CustomEvent('dashboard-warning',{detail:tr('import.metadataWarning','Карточка сохранена. Метаданные Civitai не загружены: '+error.message,{message:error.message})}));}
  }
  async function upload(){
    if(uploading||!file||!baseChoice.commit()||!universeChoice.commit()||save.disabled||!form.reportValidity())return;
    const selected=targetEntity(),type=kind.value==='loras'?contentType.value:null;
    const intent={action:attaching?'attach':'create',contentType:type,name:contentName.value.trim(),base:baseName,target:selected,
      universe:$('import-universe').value,appearance:$('import-appearance').value,outfit:$('import-outfit').value,trigger:$('import-trigger').value};
    if(!attaching&&type==='Character'&&Object.hasOwn(getSavedCharacters(),intent.name)){
      contentName.setCustomValidity(tr('import.duplicateCharacter','Такой персонаж уже есть. Измените имя или подключите модель к нему.'));contentName.reportValidity();return;
    }
    uploading=true;fields.disabled=true;cancel.disabled=true;save.disabled=true;progress.hidden=false;
    const current=revision,modelKind=kind.value;
    try{
      status.textContent=installed?tr('import.savingCard','Сохранение карточки…'):tr('import.uploadingFile','Загрузка файла…');
      // При ошибке записи карточки повторяем только запись, уже установленный файл не загружаем снова.
      installed??=await uploadFile();
      if(current!==revision)return;
      intent.source={name:installed.name,path:installed.path};
      let saved=null;
      if(modelKind==='loras'){
        saved=type==='Character'?await persistImportedCharacter(intent):await persistContentImport(intent);
      }
      const detail={action:intent.action,contentType:type,targetId:selected?.id??null,source:intent.source,
        characterName:type==='Character'?saved.name:null,contentId:type&&type!=='Character'?saved.entity.id:null,modelKind};
      window.dispatchEvent(new window.CustomEvent('prism-content-imported',{detail}));
      try{await refresh();}catch(error){window.dispatchEvent(new window.CustomEvent('dashboard-warning',{detail:tr('import.refreshWarning','Карточка сохранена. Список не обновлён: '+error.message,{message:error.message})}));}
      const modelName=installed.name,autoMetadata=modelKind==='loras'&&readPreferences().autoCivitaiMetadata;
      uploading=false;dialog.close();
      window.dispatchEvent(new window.CustomEvent('prism-import-completed',{detail}));
      if(autoMetadata)void enrich(modelName);
    }catch(error){
      if(current!==revision)return;
      status.textContent=installed?tr('import.cardFailed','Файл добавлен, но карточка не сохранена: '+error.message,{message:error.message}):error.message;
      fields.disabled=false;
    }finally{
      uploadRequest=null;uploading=false;cancel.disabled=false;
      if(dialog.open)renderIntent();
    }
  }
  async function inspect(files){
    if(uploading||dialog.open)return;
    const current=++revision;
    file=files[0];installed=null;attaching=false;headerMetadata={};knownEntities=[];
    kind.disabled=false;baseChoice.input.disabled=false;
    fields.hidden=true;fields.disabled=true;save.disabled=true;save.textContent=tr('import.add','Добавить');progress.hidden=true;progress.value=0;cancel.textContent=tr('import.cancel','Отмена');
    $('model-import-title').textContent=tr('import.addToPrism','Добавить в Prism');
    $('import-filename').textContent=file?.name??'';$('import-evidence').textContent='';
    $('import-model-summary').textContent='';$('import-destination').textContent='';
    status.textContent=tr('import.reading','Чтение файла…');kind.value='';baseName='';knownBases=[];contentType.value='';
    contentName.value='';contentName.setCustomValidity('');
    universeName='';universeChoice.sync();
    for(const id of ['import-appearance','import-outfit','import-trigger'])$(id).value='';
    baseChoice.sync();dialog.showModal();$('model-import-title').focus({preventScroll:true});
    try{
      if(files.length!==1||!file?.name.toLowerCase().endsWith('.safetensors'))throw new Error(tr('import.oneFile','Выберите один файл .safetensors.'));
      if(file.size<10||file.size>32*1024**3)throw new Error(tr('import.fileSize','Допустимый размер файла: до 32 ГБ.'));
      const prefix=new DataView(await file.slice(0,8).arrayBuffer()),size=Number(prefix.getBigUint64(0,true));
      if(size<2||size>16*1024**2||size+8>file.size)throw new Error(tr('import.invalidHeader','Некорректный заголовок safetensors.'));
      const header=JSON.parse(await file.slice(8,8+size).text());headerMetadata=header.__metadata__??{};
      const response=await fetch('/prism/import/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({header,name:file.name}),signal:AbortSignal.timeout(30000)});
      const result=await response.json();if(current!==revision)return;
      if(!response.ok)throw new Error(result.error??tr('import.metadataFailed','Не удалось прочитать метаданные.'));
      kind.value=result.kind??'';knownBases=result.bases??[];
      const targets=Array.isArray(result.entities)?result.entities:contentTargetsProvider();
      knownEntities=targets.filter(entity=>entity&&typeof entity.id==='string'&&typeof entity.name==='string'&&CONTENT_TYPES.includes(entity.type));
      baseName=result.base??'';baseChoice.sync();
      contentName.value=String(result.title||file.name).replace(/\.safetensors$/i,'').replace(/[_]+/g,' ').trim().slice(0,200);
      $('import-trigger').value=metadataText('modelspec.trigger_phrase')||metadataText('trigger_words')||metadataText('activation text');
      contentType.value=CONTENT_TYPES.includes(result.category)?result.category:'';
      updateTargets();
      $('import-technical').open=!kind.value||!baseName;
      $('import-evidence').textContent=Object.entries(result.evidence??{}).map(([key,value])=>key+': '+value).join(' · ')||tr('import.noEvidence','Дополнительные сведения не указаны.');
      fields.hidden=false;fields.disabled=false;
      status.textContent=baseName?'':tr('import.noBase','В файле не указана база. Выберите её в параметрах файла.');
      renderIntent();
    }catch(error){if(current===revision)status.textContent=error.message;}
  }
  $('import-purpose-change').onclick=()=>{$('import-purpose-picker').hidden=false;};
  $('import-attach').onclick=()=>{attaching=true;updateTargets();renderIntent();};
  $('import-create').onclick=()=>{attaching=false;renderIntent();};
  contentType.addEventListener('change',()=>{attaching=false;updateTargets();renderIntent();});
  target.addEventListener('change',renderIntent);
  contentName.addEventListener('input',()=>contentName.setCustomValidity(''));
  const dropzone=$('model-import-open'),dropHint=$('model-import-drop'),dropCard=$('lora-card');
  let dragDepth=0;
  const hideDropHint=()=>{dragDepth=0;dropHint.hidden=true;dropCard.classList.remove('file-over');};
  const updateDropHint=event=>{
    const over=dropCard.contains(event.target);dropCard.classList.toggle('file-over',over);
    dropHint.querySelector('strong').textContent=over?tr('import.release','Отпустите — добавим в Prism'):tr('import.drop','Перетащите файл сюда');
  };
  dropzone.addEventListener('click',()=>input.click());
  document.addEventListener('dragenter',event=>{
    if(!dialog.open&&[...event.dataTransfer.types].includes('Files')){
      if(dragDepth===0)window.dispatchEvent(new Event('browse-loras'));
      dragDepth++;dropHint.hidden=false;updateDropHint(event);
    }
  });
  document.addEventListener('dragleave',()=>{if(--dragDepth<=0)hideDropHint();});
  document.addEventListener('dragend',hideDropHint);window.addEventListener('blur',hideDropHint);
  input.addEventListener('change',()=>{void inspect([...input.files]);input.value='';});
  form.addEventListener('submit',event=>{event.preventDefault();void upload();});
  kind.addEventListener('change',()=>{attaching=false;renderIntent();});
  cancel.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',()=>{if(uploading)uploadRequest?.abort();});
  dialog.addEventListener('close',()=>{revision++;file=null;});
  document.addEventListener('dragover',event=>{
    if([...event.dataTransfer.types].includes('Files')){
      event.preventDefault();if(!dialog.open){dropHint.hidden=false;updateDropHint(event);event.dataTransfer.dropEffect='copy';}
    }
  });
  document.addEventListener('drop',event=>{
    hideDropHint();const files=[...event.dataTransfer.files];if(!files.some(item=>item.name.toLowerCase().endsWith('.safetensors')))return;
    event.preventDefault();event.stopPropagation();void inspect(files);
  },true);
}
