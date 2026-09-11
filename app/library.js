import { getSavedCharacters } from './characters.js';
import { parsePrism, resolveCharacterLora, MAX_PRISM_BYTES } from './character_format.js';
import { addLora, activeLoras } from './lora.js';
import { askText } from './dialogs.js';
import { openCharacterSetup, isCharacterLora, charactersForLora, useLibraryCharacter } from './character_library.js';
import { syncSelectControls } from './controls.js';
import { setPromptLoraCatalog } from './prompt_editor.js';
import {categories,categoryIcons,categoryOf} from './lora_categories.js';
import {makeDetailsOutsideDismissible,makeDialogBackdropDismissible,requestDialogClose} from './popup_behavior.js';
import {loraDetailsMap} from './api.js';

let items = [], initialized = false, category = 'all', modelRecipe = 'checkpoint';
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

function categoryButton(item, onChanged=()=>{}) {
  const button=node('button','','library-category-button');button.type='button';button.dataset.loraName=item.name;
  button.title=`Категория: ${categories[categoryOf(item)]||categoryOf(item)} · Изменить`;
  button.setAttribute('aria-label',`Изменить категорию: ${item.title}`);button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
  button.append(iconNode(categoryIcons[categoryOf(item)]||'tag'));
  button.onclick=()=>{
    document.querySelector('.library-category-menu')?.remove();
    const menu=node('div','','library-actions-menu library-category-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Категория LoRA: ${item.title}`);
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
          button.replaceChildren(iconNode(categoryIcons[value]));button.title=`Категория: ${label} · Изменить`;item=updated;
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

function addButton(item, compact = false) {
  const added=activeLoras.some(lora=>lora.name.replaceAll('\\','/')===item.name.replaceAll('\\','/'));
  const label='Добавить LoRA';
  const button=node('button',added?'Подключено':label,'library-add');
  button.type='button';button.dataset.loraName=item.name;button.disabled=added;
  if(compact){button.classList.add('library-add-icon');button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${added?'check':'plus'}"/></svg>`;}
  button.title=added?'Подключено':label;button.setAttribute('aria-label',`${button.title}: ${item.title}`);
  button.onclick=async()=>{try{const profiles=charactersForLora(item.name);if(profiles.length===1)await useLibraryCharacter(profiles[0][0]);else if(profiles.length>1){showDetails(item);return;}else addLora(item.name);document.getElementById('positive-prompt-editor')?.focus();}catch(error){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:error.message}));}};
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
  } catch { await askText('Скопируйте кейворды:',text,{title:'Кейворды LoRA',action:'Готово',readOnly:true}); }
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

function showDetails(item, preferredName, importedCharacter=null) {
  const dialog=$('lora-library-details');dialog.onclose=null;dialog.oncancel=null;dialog.classList.remove('editing-character');dialog.replaceChildren();
  const heading=node('header','','dialog-heading'),title=node('h2',item.title);title.id='library-detail-title';
  const close=node('button','Закрыть');close.type='button';close.onclick=()=>requestDialogClose(dialog);
  const categoryControl=item.name==='None'?iconNode('person'):categoryButton(item,updated=>{item=updated;if(!$('library-character-editor'))showDetails(updated,preferredName,importedCharacter);});
  heading.append(categoryControl,title,close);
  const body=node('div','','library-detail-body');if(item.name!=='None')body.append(preview(item));
  dialog.classList.toggle('character-without-lora',item.name==='None');
  const meta=node('div','','library-detail-text');
  const details=node('div','','library-detail-meta');
  details.append(cardRow('p',[item.base,item.version].filter(Boolean).join(' · '),'palette','Базовая модель и версия'));
  if(item.author){const author=cardRow('p',item.author,'user-circle','Автор');author.dataset.detail='author';details.append(author);}
  const file=cardRow('a',item.name,'cube','Файл модели','library-file-link');file.href='/prism/lora-library/reveal?'+new URLSearchParams({name:item.name});file.title='Показать файл в Проводнике';
  details.append(file);
  if(item.tags.length)details.append(cardRow('p',item.tags.join(' · '),'tag','Теги','library-tags'));
  if(item.name!=='None')meta.append(details);
  if(item.triggers.length) {
    const heading=node('div','','library-keywords-row');heading.append(cardRow('h3','Триггеры','keywords','Триггеры'),copyButton(item));meta.append(heading);
    const tags=node('div','','library-trigger-list');
    for(const word of item.triggers){const tag=node('button',word);tag.type='button';tag.title='Скопировать триггер';tag.onclick=()=>copyKeywords(word,tag);tags.append(tag);}
    meta.append(tags);
  }
  if(item.description)meta.append(cardRow('p',item.description,'document','Описание','library-description'));
  if(item.url){const link=node('a','','library-civitai-link');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.title='Открыть на Civitai';link.setAttribute('aria-label',link.title);link.append(iconNode('civitai'));meta.append(link);}
  if(!importedCharacter&&!isCharacterLora(item)&&item.name!=='None')meta.append(addButton(item));
  body.append(meta);dialog.append(heading,body);
  if(importedCharacter||isCharacterLora(item)||item.name==='None') {
    const profiles=charactersForLora(item.name),active=$('character-select').value;
    const name=preferredName??(profiles.find(([key])=>key===active)?.[0]||profiles[0]?.[0]||'');
    openCharacterSetup(item,name,selected=>showDetails(item,selected),items,importedCharacter);
  }
  syncSelectControls();if(!dialog.open)dialog.showModal();
}

function itemForCharacter(character) {
  return items.find(item=>item.name.replaceAll('\\','/')===(character.lora||'None').replaceAll('\\','/'))||{name:character.lora||'None',title:character.name||'Новый персонаж',base:'',version:'',author:'',tags:[],triggers:[],description:'',url:'',...character.source,preview:''};
}

function render() {
  const query=$('lora-library-search').value.toLocaleLowerCase().trim(),base=$('lora-library-base').value;
  const visible=items.filter(item=>(category==='all'||categoryOf(item)===category)&&(base==='all'||item.base.toLowerCase()===base.toLowerCase())&&[item.title,item.name,item.author,...item.tags,...item.triggers,...charactersForLora(item.name).flatMap(([name,char])=>[name,char.universe||''])].join(' ').toLocaleLowerCase().includes(query));
  const grid=$('lora-library-grid');grid.replaceChildren();
  for(const item of visible) {
    const card=node('article','','library-card');card.dataset.name=item.name;
    const open=node('button','','library-open');open.type='button';open.setAttribute('aria-label',`Подробнее: ${item.title}`);open.onclick=()=>showDetails(item);open.append(preview(item));
    const type=categoryOf(item);
    const title=cardRow('strong',item.title,categoryIcons[type]||'tag',categories[type]||type,'library-card-title');
    title.firstElementChild.replaceWith(categoryButton(item));
    const info=node('div','','library-card-info');info.append(title,cardRow('small',item.base,'palette','Базовая модель'));
    if(item.author)info.append(cardRow('small',item.author,'user-circle','Автор'));
    if(item.triggers.length)info.append(cardRow('p',item.triggers.join(', '),'keywords','Триггерворды','library-card-triggers'));
    const actions=node('div','','library-card-actions');actions.append(addButton(item,true),copyButton(item));
    const update=node('button','','library-update');update.type='button';update.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#icon-refresh"/></svg>';update.title='Обновить метаданные с Civitai';update.setAttribute('aria-label',`Обновить с Civitai: ${item.title}`);
    const message=node('small',item.warning,'library-card-status');message.setAttribute('role','status');
    update.onclick=async()=>{
      update.disabled=true;message.textContent='Поиск на Civitai…';
      try{const response=await fetch('/prism/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=items.map(old=>old.name===item.name?data:old);syncFilters();render();$('lora-library-status').textContent=`Обновлено с Civitai: ${data.title}`;}
      catch(error){message.textContent=error.message;update.disabled=false;}
    };
    actions.append(update);info.append(actions,message);card.append(open,info);grid.append(card);
  }
  if(!visible.length)grid.append(node('p',items.length?'По запросу ничего не найдено':'Нет установленных LoRA. Импортируйте файл.'));
  $('lora-library-status').textContent=`Показано ${visible.length} из ${items.length}`;
}

function syncFilters() {
  const groups=[...new Set(items.map(categoryOf))];
  if(category!=='all'&&!groups.includes(category))category='all';
  const tabs=$('lora-library-categories');tabs.replaceChildren();
  for(const key of ['all',...groups]) {
    const count=key==='all'?items.length:items.filter(item=>categoryOf(item)===key).length;
    const button=node('button',`${key==='all'?'Все':categories[key]||key} · ${count}`);
    button.type='button';button.dataset.category=key;button.setAttribute('aria-pressed',String(category===key));
    button.onclick=()=>{category=key;for(const tab of tabs.querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.category===category));render();};tabs.append(button);
  }
  const select=$('lora-library-base'),value=select.value;
  select.replaceChildren(new Option('Все базовые модели','all'));
  const bases=new Map();
  for(const {base} of items)if(!bases.has(base.toLowerCase()))bases.set(base.toLowerCase(),base);
  for(const base of [...bases.values()].sort())select.add(new Option(base,base));
  select.value=[...select.options].find(option=>option.value.toLowerCase()===value.toLowerCase())?.value??'all';syncSelectControls();
}

function applyModelBaseFilter() {
  const select=$('lora-library-base');
  select.value=modelRecipe==='anima'?[...select.options].find(option=>option.value.toLowerCase()==='anima')?.value??'all':'all';
  syncSelectControls();
}

function syncPromptNames() {
  setPromptLoraCatalog(()=>[
    ...Object.entries(getSavedCharacters()).map(([name,character])=>({name:character.lora,title:name,category:categoryOf(itemForCharacter(character)),character:{...character,name}})),
    ...items.filter(item=>!charactersForLora(item.name).length).map(item=>({name:item.name,title:item.title,category:categoryOf(item)}))
  ]);
}

export async function loadLoraLibrary() {
  if(!initialized) {
    initialized=true;
    const root=node('section','','lora-library');root.id='lora-library';root.setAttribute('aria-labelledby','lora-library-title');
    root.innerHTML='<div class="library-heading"><h3 id="lora-library-title">Библиотека LoRA</h3><small id="lora-library-status" role="status" aria-live="polite"></small></div><div id="lora-library-categories" role="group" aria-label="Категория LoRA"></div><div class="library-filters"><input type="search" id="lora-library-search" placeholder="Название, автор или триггер…" aria-label="Поиск LoRA"><select id="lora-library-base" aria-label="Базовая модель LoRA"><option value="all">Все базовые модели</option></select></div><div id="lora-library-grid"></div>';
    $('lora-card').append(root);
    $('lora-card').hidden=false;
    const actions=node('details','','library-actions'),summary=node('summary','+');summary.title='Действия библиотеки';summary.setAttribute('aria-label','Действия библиотеки');actions.append(summary);
    makeDetailsOutsideDismissible(actions);
    const menu=node('div','','library-actions-menu');actions.append(menu);root.querySelector('.library-heading').append(actions);
    const standalone=$('add-character-btn');standalone.textContent='Создать персонажа';standalone.title='Создать персонажа с LoRA или без неё';menu.append(standalone,$('model-import-open'));
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
      window.dispatchEvent(new Event('show-content-settings'));$('lora-library-search').value='';syncFilters();applyModelBaseFilter();category='all';render();root.scrollIntoView({block:'start'});$('lora-library-search').focus();
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
    const dialog=document.createElement('dialog');dialog.id='lora-library-details';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','library-detail-title');document.body.append(dialog);makeDialogBackdropDismissible(dialog);
    $('lora-library-search').addEventListener('input',render);$('lora-library-base').addEventListener('change',render);
    const syncAdded=()=>{for(const button of document.querySelectorAll('.library-add')){
      const key=button.dataset.loraName.replaceAll('\\','/');
      button.disabled=activeLoras.some(lora=>lora.name.replaceAll('\\','/')===key);
      const label=button.disabled?'Подключено':'Добавить LoRA';
      const icon=button.querySelector('use');if(icon)icon.setAttribute('href',button.disabled?'#icon-check':'#icon-plus');else button.textContent=label;
      button.title=label;button.setAttribute('aria-label',`${label}: ${button.dataset.loraName}`);
    }};
    window.addEventListener('save-settings',()=>{syncAdded();syncPromptNames();});window.addEventListener('settings-applied',()=>{syncAdded();syncPromptNames();});
  }
  $('lora-library-status').textContent='Загрузка библиотеки…';
  try {const response=await fetch('/prism/lora-library',{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=data.items;
    for(const item of items){const key=item.name.replaceAll('\\','/'),current=loraDetailsMap[key]??loraDetailsMap[item.name]??{triggers:item.triggers??[]};loraDetailsMap[key]={...current,base_model:/anima/i.test(item.base)?'anima':current.base_model};}
    syncPromptNames();syncFilters();render();}
  catch(error){$('lora-library-status').textContent=`Библиотека недоступна: ${error.message}`;}
}
