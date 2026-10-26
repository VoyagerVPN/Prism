import { getSavedCharacters, assignCharacterPortrait } from './characters.js';
import { parsePrism, resolveCharacterLora, MAX_PRISM_BYTES } from './character_format.js';
import { addLora, activeLoras } from './lora.js';
import { askText } from './dialogs.js';
import { openCharacterSetup, isCharacterLora, charactersForLora, useLibraryCharacter } from './character_library.js';
import { syncSelectControls } from './controls.js';
import { setPromptContentCatalog, insertPromptContent, promptContentSelections, promptContentSubjects } from './prompt_editor.js';
import {createContentCatalog} from './content_catalog.js';
import {resolveContentPlan} from './content_resolver.js';
import {categories,categoryIcons,categoryOf,contentCategories,contentCategoryIcons,contentTypeOf,contentActionLabels,contentIntensityLabels} from './lora_categories.js';
import {makeDetailsOutsideDismissible,makeDialogBackdropDismissible,requestDialogClose} from './popup_behavior.js';
import {loraDetailsMap} from './api.js';
import {setImportContentTargetsProvider} from './import.js';
import {getPersistedContentEntities,loadContentRegistry} from './content_registry.js';

let items = [], initialized = false, category = 'all', modelRecipe = 'checkpoint', semanticCatalog=createContentCatalog([]), contentBySource=new Map(), semanticEntities=[], contentRegistryError='';
const $ = id => document.getElementById(id);
const node = (tag,text,className) => {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};

function iconNode(name, label = '') {
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.classList.add('ui-icon');
  if(label){icon.setAttribute('role','img');icon.setAttribute('aria-label',label);const tooltip=document.createElementNS(icon.namespaceURI,'title');tooltip.textContent=label;icon.append(tooltip);}
  else icon.setAttribute('aria-hidden','true');
  const use=document.createElementNS(icon.namespaceURI,'use');use.setAttribute('href',`#icon-${name}`);icon.append(use);return icon;
}

function cardRow(tag, text, iconName, label, className = '') {
  const row=node(tag,'',`library-card-row ${className}`);
  row.append(iconNode(iconName,label),node('span',text));return row;
}

function descriptionRow(item) {
  const row=node('section','','library-card-row library-description');
  const column=node('div','','library-description-column');
  const content=node('div','','library-rich-description');
  if(item.descriptionHtml){
    const mode=node('div','','library-description-mode');mode.setAttribute('role','group');mode.setAttribute('aria-label','Вид описания');
    const richMode=node('button','Rich'),plainMode=node('button','Plain');richMode.type=plainMode.type='button';
    richMode.dataset.descriptionMode='rich';plainMode.dataset.descriptionMode='plain';
    const display=rich=>{
      richMode.setAttribute('aria-pressed',String(rich));plainMode.setAttribute('aria-pressed',String(!rich));
      content.classList.toggle('library-plain-description',!rich);
      if(rich)content.innerHTML=item.descriptionHtml;else content.textContent=item.description;
    };
    richMode.onclick=()=>display(true);plainMode.onclick=()=>display(false);mode.append(richMode,plainMode);column.append(mode);display(true);
  }else {content.classList.add('library-plain-description');content.textContent=item.description;}
  column.append(content);row.append(iconNode('document','Описание'),column);return row;
}

function categoryButton(item, onChanged=()=>{}, compact=false, displayType=contentTypeOf(item)) {
  const button=node('button','','library-category-button');button.type='button';button.dataset.loraName=item.name;
  button.classList.toggle('is-compact',compact);
  button.title=`Категория: ${categories[categoryOf(item)]||categoryOf(item)} · Изменить`;
  button.setAttribute('aria-label',`Изменить категорию: ${item.title}`);button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
  const renderCategory=value=>button.replaceChildren(iconNode(contentCategoryIcons[value]||categoryIcons[value]||'tag'),...(compact?[]:[node('small',contentCategories[value]||categories[value]||value,'library-category-label')]));
  renderCategory(displayType);
  button.onclick=()=>{
    document.querySelector('.library-category-menu')?.remove();
    const menu=node('div','','library-actions-menu library-category-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Категория источника: ${item.title}`);
    const status=node('p','','library-category-status');status.setAttribute('role','status');
    menu.addEventListener('toggle',event=>{button.setAttribute('aria-expanded',String(event.newState==='open'));if(event.newState==='closed')menu.remove();});
    for(const [value,label] of Object.entries(categories)){
      const option=node('button');option.type='button';option.dataset.category=value;option.setAttribute('role','menuitemradio');option.setAttribute('aria-checked',String(categoryOf(item)===value));option.append(iconNode(categoryIcons[value]),node('span',label));
      option.onclick=async()=>{
        if(value===categoryOf(item)){menu.hidePopover();return;}
        const choices=[...menu.querySelectorAll('button')];for(const choice of choices)choice.disabled=true;
        status.textContent='Сохранение…';
        try{
          const response=await fetch('/prism/lora-library/category',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name,category:value}),signal:AbortSignal.timeout(20000)});
          const updated=await response.json();if(!response.ok)throw new Error(updated.error||`HTTP ${response.status}`);
          items=items.map(current=>current.name===item.name?updated:current);
          if(category!=='all')category=value;
          if(menu.isConnected)menu.hidePopover();syncFilters();render();syncPromptNames();
          displayType=contentTypeOf(updated);renderCategory(displayType);button.title=`Категория: ${contentCategories[displayType]||label} · Изменить`;item=updated;
          onChanged(updated);
        }catch(error){status.textContent=error.message;for(const choice of choices)choice.disabled=false;}
      };
      menu.append(option);
    }
    menu.append(status);(button.closest('dialog')||document.body).append(menu);menu.showPopover();button.setAttribute('aria-expanded','true');
    const anchor=button.getBoundingClientRect(),rect=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(anchor.left,window.innerWidth-rect.width-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(anchor.bottom+4,window.innerHeight-rect.height-8))}px`;
    const current=menu.querySelector('[aria-checked="true"]')||menu.querySelector('button');current?.focus();
    menu.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();menu.hidePopover();button.focus();}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();const options=[...menu.querySelectorAll('button:not(:disabled)')],index=options.indexOf(document.activeElement);
        options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length]?.focus();
      }
    };
  };
  return button;
}

function preview(item) {
  const box=node('div','','library-preview');
  if(item.preview) {
    const image=document.createElement('img');image.src=item.preview;image.alt=item.title;image.loading='lazy';image.referrerPolicy='no-referrer';
    image.onerror=()=>box.replaceChildren(node('span','Превью недоступно'));
    box.append(image);
  } else box.append(node('span','Нет превью'));
  return box;
}

function mediaUrl(media) {
  return media?.id?'/prism/media?'+new URLSearchParams({id:media.id}):'';
}

function subjectScoped(content, contentType) {
  return ['Pose','Clothing'].includes(contentType)&&content?.scopes.includes('subject');
}

function contentAlreadyAssigned(content, contentType) {
  const selections=promptContentSelections();
  if(!subjectScoped(content,contentType))return selections.some(selection=>selection.contentId===content?.id&&selection.scope==='global');
  const subjects=promptContentSubjects();
  return subjects.length>0&&subjects.every(subject=>selections.some(selection=>selection.contentId===content.id&&selection.subjectId===subject.id));
}

function chooseContentSubject(content) {
  const subjects=promptContentSubjects();
  if(!subjects.length){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:`Сначала добавьте персонажа в промпт, затем назначьте «${content.name}».`}));return Promise.resolve(null);}
  if(subjects.length===1)return Promise.resolve(subjects[0]);
  let dialog=$('content-subject-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='content-subject-dialog';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','content-subject-title');
    dialog.innerHTML='<form><h2 id="content-subject-title">Кому назначить?</h2><label>Персонаж<select name="subject" required></select></label><p class="content-subject-status" role="status"></p><div class="dialog-actions"><button type="button" data-cancel>Отмена</button><button type="submit" class="dialog-primary">Назначить</button></div></form>';
    document.body.append(dialog);makeDialogBackdropDismissible(dialog);
  }
  dialog.querySelector('h2').textContent=`Кому назначить «${content.name}»?`;
  const select=dialog.querySelector('select');select.replaceChildren(...subjects.map(subject=>new Option(subject.name,subject.id)));
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;if(dialog.open)dialog.close();resolve(value);};
    dialog.querySelector('[data-cancel]').onclick=()=>finish(null);
    dialog.oncancel=event=>{event.preventDefault();finish(null);};dialog.onclose=()=>finish(null);
    dialog.querySelector('form').onsubmit=event=>{event.preventDefault();finish(subjects.find(subject=>subject.id===select.value)??null);};
    dialog.showModal();select.focus();
  });
}

function addButton(item, compact = false, contentType=contentTypeOf(item), resolvedContent=null) {
  const added=resolvedContent?contentAlreadyAssigned(resolvedContent,contentType):activeLoras.some(lora=>lora.name.replaceAll('\\','/')===item.name.replaceAll('\\','/'));
  const label=contentActionLabels[contentType]??'Добавить';
  const button=node('button',added?'Подключено':label,'library-add');
  button.type='button';button.dataset.loraName=item.name;button.disabled=added;
  button.dataset.contentAction=contentType;button.dataset.intensityLabel=contentIntensityLabels[contentType]??'';
  if(resolvedContent){button.dataset.contentId=resolvedContent.id;button.dataset.subjectScoped=String(subjectScoped(resolvedContent,contentType));}
  if(compact){button.classList.add('library-add-icon');button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${added?'check':'plus'}"/></svg>`;}
  button.title=added?'Подключено':`${label}${contentIntensityLabels[contentType]?` · ${contentIntensityLabels[contentType]}`:''}`;button.setAttribute('aria-label',`${button.title}: ${item.title}`);
  button.onclick=async()=>{
    const content=resolvedContent??contentBySource.get(item.name);
    if(content){
      const target=subjectScoped(content,contentType)?await chooseContentSubject(content):null;
      if(subjectScoped(content,contentType)&&!target)return;
      const selection=target?{contentId:content.id,scope:'subject',subjectId:target.id,parameters:{subjectName:target.name}}:{contentId:content.id,scope:'global'};
      insertPromptContent(resolveContentPlan({catalog:semanticCatalog,selections:[selection],modelRecipe:{recipe:modelRecipe||'checkpoint'}}).contentParts[0]);
    }
    else addLora(item.name);
    document.getElementById('positive-prompt-editor')?.focus();
  };
  return button;
}

async function copyKeywords(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const icon=button.querySelector('use');
    if(icon) {
      icon.setAttribute('href','#icon-check');button.title='Скопировано';button.dataset.copied='true';
      setTimeout(()=>{icon.setAttribute('href','#icon-copy');button.title='Копировать все кейворды';delete button.dataset.copied;},1500);
    } else {
      button.dataset.copyLabel ??= button.textContent;button.textContent='Скопировано';
      setTimeout(()=>{button.textContent=button.dataset.copyLabel;},1500);
    }
  } catch { await askText('Скопируйте кейворды:',text,{title:'Кейворды источника',action:'Готово',readOnly:true}); }
}

function copyButton(item) {
  const button=node('button','','library-copy');button.type='button';
  button.disabled=!item.triggers.length;
  button.title=button.disabled?'Нет кейвордов':'Копировать все кейворды';
  button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#icon-copy"/></svg>';
  button.setAttribute('aria-label',`Копировать все кейворды: ${item.title}`);
  button.onclick=()=>copyKeywords(item.triggers.join(', '),button);
  return button;
}

function useCharacterButton(name) {
  const button=node('button','Добавить персонажа','library-use-character');button.type='button';button.dataset.characterName=name;
  button.title=`Добавить персонажа: ${name}`;button.setAttribute('aria-label',button.title);
  button.onclick=async()=>{try{await useLibraryCharacter(name);document.getElementById('positive-prompt-editor')?.focus();}catch(error){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:error.message}));}};
  return button;
}

function createCharacterButton(item) {
  const button=node('button','Создать персонажа','library-create-character');button.type='button';
  button.title=`Создать персонажа из ${item.title}`;button.setAttribute('aria-label',button.title);button.onclick=()=>showDetails(item,'');return button;
}

function setupSourceButton(item) {
  const button=node('button',contentActionLabels.inbox,'library-setup-source');button.type='button';
  button.title=`Определить назначение: ${item.title}`;button.setAttribute('aria-label',button.title);button.onclick=()=>showDetails(item);
  return button;
}

function updateButton(item, message) {
  const retry=['partial','failed'].includes(item.metadataStatus);
  const button=node('button','','library-update');button.type='button';button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#icon-refresh"/></svg>';button.title=retry?'Повторить загрузку метаданных Civitai':'Обновить метаданные с Civitai';button.setAttribute('aria-label',`${button.title}: ${item.title}`);
  button.onclick=async()=>{
    button.disabled=true;message.textContent='Поиск на Civitai…';
    try{const response=await fetch('/prism/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=items.map(old=>old.name===item.name?data:old);syncFilters();render();$('lora-library-status').textContent=data.metadataStatus==='partial'?data.warning:`Обновлено с Civitai: ${data.title}`;}
    catch(error){message.textContent=error.message;button.disabled=false;}
  };
  return button;
}

async function assignMedia(source, target) {
  if(target.kind==='character')return assignCharacterPortrait(target.name,source);
  const response=await fetch('/prism/media/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,target}),signal:AbortSignal.timeout(90000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||`Не удалось назначить обложку: HTTP ${response.status}`);
  items=items.map(item=>item.name===data.item.name?data.item:item);syncFilters();render();return data.media;
}

export function openMediaAssignment(source,{characterNames=null,allowedKinds=['character','lora'],defaultKind='character'}={}) {
  let dialog=$('media-assignment-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='media-assignment-dialog';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','media-assignment-title');
    dialog.innerHTML='<form><h2 id="media-assignment-title">Использовать изображение как…</h2><label>Тип назначения<select name="media-kind"></select></label><label>Цель<select name="media-target" required></select></label><p class="media-assignment-status" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" data-cancel>Отмена</button><button type="submit" class="dialog-primary">Сохранить</button></div></form>';
    document.body.append(dialog);makeDialogBackdropDismissible(dialog);
  }
  const kind=dialog.querySelector('[name="media-kind"]'),target=dialog.querySelector('[name="media-target"]'),status=dialog.querySelector('.media-assignment-status'),submit=dialog.querySelector('[type="submit"]');
  const permitted=allowedKinds.filter(value=>value==='character'||value==='lora');
  kind.replaceChildren(...permitted.map(value=>new Option(value==='character'?'Портрет персонажа':'Обложка источника',value)));
  kind.value=permitted.includes(defaultKind)?defaultKind:permitted[0];kind.closest('label').hidden=permitted.length===1;
  const fillTargets=()=>{
    target.replaceChildren();
    if(kind.value==='character'){
      const allowed=characterNames?new Set(characterNames):null;
      for(const [name,character] of Object.entries(getSavedCharacters()))if(!allowed||allowed.has(name))target.add(new Option(character.universe?`${name} — ${character.universe}`:name,name));
    }else for(const item of items)target.add(new Option(item.title,item.name));
    submit.disabled=!target.options.length;status.textContent=target.options.length?'':'Нет доступных целей для этого назначения.';
  };
  kind.onchange=fillTargets;fillTargets();
  return new Promise(resolve=>{
    const finish=value=>{if(dialog.open)dialog.close();resolve(value);};
    dialog.querySelector('[data-cancel]').onclick=()=>finish(null);
    dialog.oncancel=event=>{event.preventDefault();finish(null);};
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();submit.disabled=true;status.textContent='Сохранение изображения…';
      try{const result=await assignMedia(source,{kind:kind.value,name:target.value});status.textContent='Изображение сохранено';finish(result);}
      catch(error){status.textContent=error.message;submit.disabled=false;}
    };
    dialog.showModal();target.focus();
  });
}

function mediaRail(item, preferredName) {
  const characterMode=preferredName!==undefined;
  const rail=node('aside','','library-media-rail');rail.setAttribute('aria-label',characterMode?'Изображения персонажа':'Изображения источника');
  const status=node('small','','library-media-status');status.setAttribute('role','status');
  const character=preferredName!==undefined?getSavedCharacters()[preferredName]:null;
  const current=character?.portrait?{...character.portrait,url:mediaUrl(character.portrait)}:characterMode?null:item.cover;
  if(current?.url){const figure=node('figure','','library-media-item library-current-media'),image=document.createElement('img'),label=node('figcaption',character?'Текущий портрет':'Текущая обложка');image.src=current.url;image.alt=label.textContent;figure.append(image,label);rail.append(figure);}
  for(const sourceImage of item.images??[]){
    const figure=node('figure','','library-media-item');figure.dataset.civitaiImage=sourceImage.id;
    const image=document.createElement('img');image.src=sourceImage.url;image.alt=`${item.title}: изображение Civitai`;image.loading='lazy';image.referrerPolicy='no-referrer';
    const actions=node('figcaption','','library-media-actions');
    const source={kind:'civitai',lora:item.name,id:sourceImage.id};
    const run=async(button,target)=>{button.disabled=true;status.textContent='Сохранение изображения…';try{await assignMedia(source,target);status.textContent=target.kind==='lora'?'Обложка источника сохранена':`Портрет «${target.name}» сохранён`;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
    if(characterMode){
      const portrait=node('button','Сделать портретом');portrait.type='button';portrait.dataset.mediaAction='character-portrait';portrait.disabled=!preferredName;portrait.title=preferredName?`Сделать портретом «${preferredName}»`:'Сначала сохраните персонажа';
      portrait.onclick=()=>{if(preferredName)void run(portrait,{kind:'character',name:preferredName});};actions.append(portrait);
    }else{
      const cover=node('button','Сделать обложкой источника');cover.type='button';cover.dataset.mediaAction='lora-cover';cover.title='Сделать обложкой источника';cover.onclick=()=>run(cover,{kind:'lora',name:item.name});actions.append(cover);
    }
    figure.append(image,actions);rail.append(figure);
  }
  if(!rail.children.length)rail.append(preview(preferredName?characterView(preferredName,getSavedCharacters()[preferredName]):item));
  if(!(item.images??[]).length){
    const refresh=node('button','Загрузить изображения Civitai','library-media-refresh');refresh.type='button';refresh.dataset.mediaAction='refresh-civitai';
    refresh.onclick=async()=>{
      refresh.disabled=true;status.textContent='Загрузка изображений Civitai…';
      try{
        const response=await fetch('/prism/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name}),signal:AbortSignal.timeout(90000)});
        const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
        items=items.map(old=>old.name===item.name?data:old);syncFilters();render();showDetails(data,preferredName);
      }catch(error){status.textContent=error.message;refresh.disabled=false;}
    };
    rail.append(refresh);
  }
  rail.append(status);return rail;
}

function showDetails(item, preferredName, importedCharacter=null) {
  const dialog=$('lora-library-details');dialog.onclose=null;dialog.oncancel=null;dialog.classList.remove('editing-character');dialog.replaceChildren();
  const editingCharacter=importedCharacter!==null||preferredName!==undefined||item.name==='None';
  const profiles=editingCharacter?charactersForLora(item.name):[],active=$('character-select').value;
  const selectedName=editingCharacter?(preferredName??(profiles.find(([key])=>key===active)?.[0]||profiles[0]?.[0]||'')):undefined;
  const displayItem=selectedName?{...item,title:selectedName}:item;
  const heading=node('header','','dialog-heading'),title=node('h2',displayItem.title);title.id='library-detail-title';
  const close=node('button','Закрыть');close.type='button';close.onclick=()=>requestDialogClose(dialog);
  const categoryControl=item.name==='None'?iconNode('person'):categoryButton(displayItem,updated=>{item=updated;if(!$('library-character-editor'))showDetails(updated,preferredName,importedCharacter);});
  heading.append(categoryControl,title);
  if(editingCharacter&&selectedName&&item.name!=='None'){
    const create=node('button','Создать ещё персонажа','library-create-related-character');create.type='button';create.onclick=()=>showDetails(item,'');heading.append(create);
  }
  heading.append(close);
  const body=node('div','','library-detail-body');if(item.name!=='None')body.append(mediaRail(displayItem,selectedName));
  dialog.classList.toggle('character-without-lora',item.name==='None');
  const meta=node('div','','library-detail-text');
  const contentType=contentTypeOf(item),intensity=contentIntensityLabels[contentType];
  if(intensity)meta.append(cardRow('p',intensity,'sliders','Параметр интенсивности','library-intensity-language'));
  const technical=node('details','','library-technical-details'),technicalSummary=node('summary','Технические детали');
  const detailRows=node('div','','library-detail-meta');
  detailRows.append(cardRow('p',[item.base,item.version].filter(Boolean).join(' · '),'palette','Базовая модель и версия'));
  if(item.author){const author=cardRow('p',item.author,'user-circle','Автор');author.dataset.detail='author';detailRows.append(author);}
  const file=cardRow('a',item.name,'cube','Файл модели','library-file-link');file.href='/prism/lora-library/reveal?'+new URLSearchParams({name:item.name});file.title='Показать файл в Проводнике';
  detailRows.append(file);
  if(item.tags.length)detailRows.append(cardRow('p',item.tags.join(' · '),'tag','Теги','library-tags'));
  if(item.name!=='None'){technical.append(technicalSummary,detailRows);meta.append(technical);}
  if(item.triggers.length) {
    const heading=node('div','','library-keywords-row');heading.append(cardRow('h3','Триггеры','keywords','Триггеры'),copyButton(item));meta.append(heading);
    const tags=node('div','','library-trigger-list');
    for(const word of item.triggers){const tag=node('button',word);tag.type='button';tag.title='Скопировать триггер';tag.onclick=()=>copyKeywords(word,tag);tags.append(tag);}
    meta.append(tags);
  }
  if(item.descriptionHtml||item.description)meta.append(descriptionRow(item));
  if(item.url){const link=node('a','','library-civitai-link');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.title='Открыть на Civitai';link.setAttribute('aria-label',link.title);link.append(iconNode('civitai'));meta.append(link);}
  if(!editingCharacter&&item.name!=='None')meta.append(isCharacterLora(item)?createCharacterButton(item):addButton(item));
  body.append(meta);dialog.append(heading,body);
  if(editingCharacter) {
    openCharacterSetup(item,selectedName,selected=>showDetails(item,selected),items,importedCharacter);
  }
  syncSelectControls();if(!dialog.open)dialog.showModal();
}

function itemForCharacter(character) {
  return items.find(item=>item.name.replaceAll('\\','/')===(character.lora||'None').replaceAll('\\','/'))||{name:character.lora||'None',title:character.name||'Новый персонаж',base:'',version:'',author:'',tags:[],triggers:[],description:'',url:'',...character.source,preview:''};
}

function characterView(name, character) {
  const lora=itemForCharacter(character);
  return {...lora,title:name,preview:mediaUrl(character.portrait)||lora.preview,character:{...character,name},loraTitle:lora.name==='None'?'Без дополнительного источника':lora.title};
}

function semanticId(type, label) {
  let hash=2166136261;
  for(const symbol of `${type}\0${label}`){hash^=symbol.codePointAt(0);hash=Math.imul(hash,16777619);}
  return `${type.toLowerCase()}:${(hash>>>0).toString(36)}`;
}

function sourceRecipe(item) {
  if(/qwen.*2[._ -]?1/i.test(item.base??''))return 'qwen-image-2.1';
  return /anima/i.test(item.base??'')?'anima':'checkpoint';
}

function unavailableItem(entity) {
  const source=entity.bindings.find(binding=>binding.kind==='lora')?.name??'';
  return {name:source,title:entity.name,base:'',version:'',author:'',tags:[],triggers:[],preview:'',cover:null,images:[],description:'',url:'',unavailable:true};
}

function catalogEntities() {
  const descriptors=[];
  for(const [name,character] of Object.entries(getSavedCharacters())){
    const item=itemForCharacter(character),binding=item.name&&item.name!=='None'?{kind:'lora',name:item.name,strength:character.strength??1}:{kind:'prompt',positive:[character.appearance||name]};
    descriptors.push({kind:'character',type:'Character',item,view:characterView(name,character),name,bindings:[binding],identity:`${name}\0${character.universe||''}`});
  }
  const bySource=new Map(items.map(item=>[item.name.replaceAll('\\','/'),item])),claimedSources=new Set();
  for(const content of getPersistedContentEntities().filter(entity=>entity.type!=='Character')){
    const sourceBindings=content.bindings.filter(binding=>binding.kind==='lora');
    for(const binding of sourceBindings)claimedSources.add(binding.name.replaceAll('\\','/'));
    const compatible=sourceBindings.find(binding=>!binding.compatibleRecipes||binding.compatibleRecipes.includes(modelRecipe));
    const item=bySource.get((compatible??sourceBindings[0])?.name.replaceAll('\\','/'))??unavailableItem(content);
    const triggers=content.bindings.filter(binding=>binding.kind==='prompt').flatMap(binding=>binding.positive);
    descriptors.push({kind:'content',type:content.type,item,view:{...item,title:content.name,category:content.type,triggers},bindings:content.bindings,identity:content.id,content,unavailable:item.unavailable===true});
  }
  for(const item of items){
    if(claimedSources.has(item.name.replaceAll('\\','/')))continue;
    const type=contentTypeOf(item);
    if(type==='Character'&&charactersForLora(item.name).length)continue;
    const bindings=[...(item.triggers?.length?[{kind:'prompt',positive:item.triggers,negative:[]}]:[]),{kind:'lora',name:item.name,strength:1,compatibleRecipes:[sourceRecipe(item)]}];
    descriptors.push({kind:type==='inbox'?'source':'content',type,item,view:item,bindings,identity:`${item.title}\0${item.author||''}\0${item.version||''}`});
  }
  const usedIds=new Set(getPersistedContentEntities().map(entity=>entity.id));
  const entries=[];
  for(const descriptor of descriptors){
    if(descriptor.type==='inbox'||descriptor.content)continue;
    let id=semanticId(descriptor.type,descriptor.identity),number=1;
    while(usedIds.has(id))id=semanticId(descriptor.type,`${descriptor.identity}\0${++number}`);
    usedIds.add(id);descriptor.content={id,type:descriptor.type,name:descriptor.view.title,scopes:descriptor.type==='Character'?['subject']:['Pose','Clothing'].includes(descriptor.type)?['global','subject']:['global'],bindings:descriptor.bindings};entries.push(descriptor.content);
  }
  semanticCatalog=createContentCatalog([...getPersistedContentEntities(),...entries]);
  const entities=descriptors.map(descriptor=>descriptor.type==='inbox'?{...descriptor,category:'inbox',content:null}:{...descriptor,category:descriptor.type,content:semanticCatalog.get(descriptor.content.id)});
  semanticEntities=entities;
  contentBySource=new Map();
  for(const entity of entities.filter(entity=>entity.kind==='content'&&entity.content))for(const binding of entity.content.bindings)if(binding.kind==='lora')contentBySource.set(binding.name,entity.content);
  return entities;
}

function render() {
  const query=$('lora-library-search').value.toLocaleLowerCase().trim(),base=$('lora-library-base').value;
  const entities=catalogEntities();
  const visible=entities.filter(({category:entityCategory,item,view})=>(category==='all'||entityCategory===category)&&(base==='all'||item.base.toLowerCase()===base.toLowerCase())&&[view.title,view.character?.universe||'',item.title,item.name,item.author,...item.tags,...item.triggers].join(' ').toLocaleLowerCase().includes(query));
  const grid=$('lora-library-grid');grid.replaceChildren();
  for(const entity of visible) {
    const {kind,item,view}=entity;
    const actionItem=kind==='content'?view:item;
    const legacyEntity=kind==='content'?(entity.type==='Character'?'character-source':'lora'):kind;
    const card=node('article','','library-card');card.dataset.name=item.name;card.dataset.libraryEntity=legacyEntity;card.dataset.contentType=entity.type;card.dataset.contentId=entity.content?.id??'';card.dataset.metadataStatus=item.metadataStatus??'idle';
    const open=node('button','','library-open');open.type='button';open.setAttribute('aria-label',`Подробнее: ${view.title}`);open.onclick=()=>showDetails(actionItem,kind==='character'?entity.name:undefined);open.append(preview(view));
    const type=entity.type;
    const title=cardRow('strong',view.title,contentCategoryIcons[type]||'tag',contentCategories[type]||type,'library-card-title');
    if(kind!=='character')title.firstElementChild.replaceWith(categoryButton(actionItem,()=>{},true,type));
    const info=node('div','','library-card-info');info.append(title);
    if(kind==='character'){
      if(view.character.universe)info.append(cardRow('small',view.character.universe,'globe','Вселенная'));
      info.append(cardRow('small',view.loraTitle,'layers','Источник образа'));
    }
    if(kind!=='character'&&item.author)info.append(cardRow('small',item.author,'user-circle','Автор'));
    if(kind==='source')info.append(cardRow('small','Требуется настройка','inbox','Статус источника'));
    const actions=node('div','','library-card-actions');
    const message=node('small',item.warning,'library-card-status');message.dataset.metadataStatus=item.metadataStatus??'idle';message.setAttribute('role','status');
    if(kind==='character')actions.append(useCharacterButton(entity.name));
    else if(kind==='source')actions.append(setupSourceButton(actionItem),updateButton(actionItem,message));
    else if(type==='Character')actions.append(createCharacterButton(actionItem),copyButton(actionItem),updateButton(actionItem,message));
    else actions.append(addButton(actionItem,false,type,entity.content),copyButton(actionItem),updateButton(actionItem,message));
    if(entity.unavailable){for(const button of actions.querySelectorAll('button'))button.disabled=true;message.textContent='Технический источник недоступен';message.dataset.metadataStatus='failed';}
    info.append(message,actions);card.append(open,info);grid.append(card);
  }
  if(!visible.length)grid.append(node('p',entities.length?'По запросу ничего не найдено':'Библиотека пока пуста.'));
  $('lora-library-status').textContent=`Показано ${visible.length} из ${entities.length}${contentRegistryError?` · ${contentRegistryError}`:''}`;
}

function syncFilters() {
  const entities=catalogEntities(),groups=[...new Set(entities.map(entity=>entity.category))];
  if(category!=='all'&&!groups.includes(category))category='all';
  const tabs=$('lora-library-categories');tabs.replaceChildren();
  for(const key of ['all',...groups]) {
    const count=key==='all'?entities.length:entities.filter(entity=>entity.category===key).length;
    const button=node('button',`${key==='all'?'Все':contentCategories[key]||key} · ${count}`);
    button.type='button';button.dataset.category=key;button.setAttribute('aria-pressed',String(category===key));
    button.onclick=()=>{category=key;for(const tab of tabs.querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.category===category));render();};tabs.append(button);
  }
  const select=$('lora-library-base'),value=select.value;
  select.replaceChildren(new Option('Все базовые модели','all'));
  const bases=new Map();
  for(const {base} of items)if(base&&!bases.has(base.toLowerCase()))bases.set(base.toLowerCase(),base);
  for(const base of [...bases.values()].sort())select.add(new Option(base,base));
  select.value=[...select.options].find(option=>option.value.toLowerCase()===value.toLowerCase())?.value??'all';syncSelectControls();
}

function applyModelBaseFilter() {
  const select=$('lora-library-base');
  select.value=modelRecipe==='anima'?[...select.options].find(option=>option.value.toLowerCase()==='anima')?.value??'all':'all';
  syncSelectControls();
}

function syncPromptNames() {
  const contentEntities=catalogEntities().filter(entity=>entity.kind==='content'&&entity.type!=='Character'&&entity.content);
  setPromptContentCatalog(()=>[
    ...Object.entries(getSavedCharacters()).map(([name,character])=>({name:character.lora,title:name,category:'Character',character:{...character,name}})),
    ...contentEntities.map(entity=>({title:entity.content.name,category:entity.content.type,content:resolveContentPlan({catalog:semanticCatalog,selections:[{contentId:entity.content.id,scope:'global'}],modelRecipe:{recipe:modelRecipe||'checkpoint'}}).contentParts[0]}))
  ]);
}

export function getContentImportTargets() {
  return semanticEntities.filter(entity=>entity.content).map(entity=>({
    ...structuredClone(entity.content),
    ...(entity.kind==='character'?{characterName:entity.name}:{}),
  }));
}
setImportContentTargetsProvider(getContentImportTargets);

export async function loadLoraLibrary() {
  if(!initialized) {
    initialized=true;
    const root=node('section','','lora-library');root.id='lora-library';root.setAttribute('aria-labelledby','lora-library-title');
    root.innerHTML='<div class="library-heading"><h3 id="lora-library-title">Библиотека</h3><small id="lora-library-status" role="status" aria-live="polite"></small></div><div id="lora-library-categories" role="group" aria-label="Категория"></div><div class="library-filters"><input type="search" id="lora-library-search" placeholder="Название, автор или триггер…" aria-label="Поиск по библиотеке"><select id="lora-library-base" aria-label="Базовая модель"><option value="all">Все базовые модели</option></select></div><div id="lora-library-grid"></div>';
    $('lora-card').append(root);
    $('lora-card').hidden=false;
    const actions=node('details','','library-actions'),summary=node('summary','Добавить');summary.title='Добавить в библиотеку';summary.setAttribute('aria-label','Добавить в библиотеку');actions.append(summary);
    makeDetailsOutsideDismissible(actions);
    const menu=node('div','','library-actions-menu');actions.append(menu);root.querySelector('.library-heading').append(actions);
    const standalone=$('add-character-btn');standalone.textContent='Создать персонажа';standalone.title='Создать персонажа с дополнительным источником или без него';menu.append(standalone,$('model-import-open'));
    const importButton=node('button','Импорт .prism'),file=document.createElement('input');importButton.type='button';file.type='file';file.accept='.prism';file.hidden=true;file.id='prism-import-input';
    importButton.onclick=()=>file.click();
    file.onchange=async()=>{
      const selected=file.files[0];if(!selected)return;
      try{
        if(selected.size>MAX_PRISM_BYTES)throw new Error('Карточка превышает 2 МБ.');
        const character=parsePrism(await selected.text()),db=getSavedCharacters(),original=character.name;
        for(let index=2;Object.hasOwn(db,character.name);index++)character.name=original.slice(0,185)+` (${index})`;
        character.lora=resolveCharacterLora(character.lora,items)??character.lora;
        showDetails(itemForCharacter(character),'',character);
        $('profile-editor-status').textContent=character.name===original?'Карточка сохранится при закрытии редактора. «Отмена» отбросит импорт.':`Имя уже занято. Карточка открыта как черновик с именем «${character.name}».`;
      }catch(error){$('lora-library-status').textContent=`Не удалось импортировать .prism: ${error.message}`;}finally{file.value='';}
    };
    menu.append(importButton,file);menu.addEventListener('click',event=>{if(event.target.closest('button'))actions.open=false;});
    window.addEventListener('browse-loras',()=>{
      window.dispatchEvent(new Event('show-content-settings'));$('lora-library-search').value='';category='all';syncFilters();applyModelBaseFilter();render();root.scrollIntoView({block:'start'});$('lora-library-search').focus();
    });
    window.addEventListener('model-recipe-changed',event=>{
      modelRecipe=event.detail?.recipe??'checkpoint';
      applyModelBaseFilter();render();
    });
    window.addEventListener('browse-characters',()=>{
      $('lora-library-search').value='';$('lora-library-base').value='all';category=items.some(item=>categoryOf(item)==='Character')?'Character':'all';syncFilters();render();
      window.dispatchEvent(new Event('show-content-settings'));root.scrollIntoView({block:'start'});$('lora-library-search').focus();
    });
    window.addEventListener('edit-library-character',event=>{
      const {name,lora}=event.detail;const item=items.find(item=>item.name.replaceAll('\\','/')===lora.replaceAll('\\','/'));
      const existing=getSavedCharacters()[name];
      showDetails(item||itemForCharacter(existing||{lora,name:'Новый персонаж'}),name);

    });
    window.addEventListener('prism-import-completed',event=>{
      const result=event.detail;if(result.modelKind!=='loras')return;
      window.dispatchEvent(new Event('show-content-settings'));
      document.querySelector('[data-mobile-panel="settings"]')?.click();
      $('lora-library-search').value='';$('lora-library-base').value='all';category=result.contentType;
      syncFilters();render();root.scrollIntoView({block:'start'});
      const character=getSavedCharacters()[result.characterName];
      if(character)showDetails(itemForCharacter(character),result.characterName);
      else {
        const entity=semanticEntities.find(entity=>entity.content?.id===result.contentId);
        if(entity)showDetails(entity.view);
      }
    });
    const dialog=document.createElement('dialog');dialog.id='lora-library-details';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','library-detail-title');document.body.append(dialog);makeDialogBackdropDismissible(dialog);
    $('lora-library-search').addEventListener('input',render);$('lora-library-base').addEventListener('change',render);
    const syncAdded=()=>{for(const button of document.querySelectorAll('.library-add')){
      const key=button.dataset.loraName.replaceAll('\\','/');
      const content=button.dataset.contentId?semanticCatalog.get(button.dataset.contentId):null;
      button.disabled=content?contentAlreadyAssigned(content,button.dataset.contentAction):activeLoras.some(lora=>lora.name.replaceAll('\\','/')===key);
      const label=button.disabled?'Подключено':contentActionLabels[button.dataset.contentAction]??'Добавить';
      const icon=button.querySelector('use');if(icon)icon.setAttribute('href',button.disabled?'#icon-check':'#icon-plus');else button.textContent=label;
      const title=button.closest('.library-card')?.querySelector('.library-card-title span:last-child')?.textContent||'контент';
      button.title=label;button.setAttribute('aria-label',`${label}: ${title}`);
    }};
    window.addEventListener('save-settings',()=>{syncAdded();syncPromptNames();syncFilters();render();});window.addEventListener('characters-updated',()=>{syncPromptNames();syncFilters();render();});window.addEventListener('settings-applied',()=>{syncAdded();syncPromptNames();});
  }
  $('lora-library-status').textContent='Загрузка библиотеки…';
  try {const response=await fetch('/prism/lora-library',{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=data.items;
    try{await loadContentRegistry({force:true});contentRegistryError='';}catch(error){contentRegistryError=`Назначения контента недоступны: ${error.message}`;}
    for(const item of items){const key=item.name.replaceAll('\\','/'),current=loraDetailsMap[key]??loraDetailsMap[item.name]??{triggers:item.triggers??[]};loraDetailsMap[key]={...current,base_model:/anima/i.test(item.base)?'anima':current.base_model};}
    syncPromptNames();syncFilters();render();}
  catch(error){$('lora-library-status').textContent=`Библиотека недоступна: ${error.message}`;}
}
