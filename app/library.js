import { addLora, activeLoras } from './lora.js';
import { askText } from './dialogs.js';
import { characterSection, isCharacterLora, charactersForLora, useLibraryCharacter } from './character_library.js';
import { syncSelectControls } from './controls.js';

let items = [], initialized = false, category = 'all';
const categories = {Character:'Персонажи',Concept:'Концепты',Style:'Стили',Clothing:'Одежда',Pose:'Позы',Object:'Объекты',Background:'Фоны',Utility:'Инструменты',Other:'Прочее'};
const categoryIcons = {Character:'person',Concept:'bulb',Style:'brush',Clothing:'shirt',Pose:'pose',Object:'cube',Background:'landscape',Utility:'tool',Other:'tag'};
const categoryOf = item => {const parts=item.name.replaceAll('\\','/').split('/');return parts.length>1?parts[0]:'Other';};
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
  const managed=isCharacterLora(item);
  const selected=document.getElementById('character-select').value;
  const activeCharacter=selected!=='none'&&document.getElementById('char-lora-select').value.replaceAll('\\','/')===item.name.replaceAll('\\','/');
  const added=managed?activeCharacter:activeLoras.some(lora=>lora.name===item.name);
  const label=managed?(charactersForLora(item.name).length?'Использовать персонажа':'Настроить персонажа'):'Добавить LoRA';
  const button=node('button',added?'Подключено':label,'library-add');
  button.type='button';button.dataset.loraName=item.name;button.dataset.character=String(managed);button.disabled=added;
  if(compact){button.classList.add('library-add-icon');button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${added?'check':'plus'}"/></svg>`;}
  button.title=added?'Подключено':label;button.setAttribute('aria-label',`${button.title}: ${item.title}`);
  button.onclick=async()=>{
    if(!managed){addLora(item.name);return;}
    const profiles=charactersForLora(item.name);
    if(profiles.length!==1){showDetails(item);return;}
    try{await useLibraryCharacter(profiles[0][0]);}catch(error){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:error.message}));}
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

function showDetails(item, preferredName) {
  const dialog=$('lora-library-details');dialog.onclose=null;dialog.classList.remove('editing-character');dialog.replaceChildren();
  const heading=node('header','','dialog-heading'),title=node('h2',item.title);title.id='library-detail-title';
  const close=node('button','Закрыть');close.type='button';close.onclick=()=>dialog.close();heading.append(iconNode(categoryIcons[categoryOf(item)]||'tag'),title,close);
  const body=node('div','','library-detail-body');body.append(preview(item));
  const meta=node('div','','library-detail-text');
  const details=node('div','','library-detail-meta');
  details.append(cardRow('p',[item.base,item.version].filter(Boolean).join(' · '),'palette','Базовая модель и версия'));
  if(item.author){const author=cardRow('p',item.author,'user-circle','Автор');author.dataset.detail='author';details.append(author);}
  const file=cardRow('a',item.name,'cube','Файл модели','library-file-link');file.href='/dashboard/lora-library/reveal?'+new URLSearchParams({name:item.name});file.title='Показать файл в Проводнике';
  details.append(file);
  if(item.tags.length)details.append(cardRow('p',item.tags.join(' · '),'tag','Теги','library-tags'));
  meta.append(details);
  if(item.triggers.length) {
    const heading=node('div','','library-keywords-row');heading.append(cardRow('h3','Триггеры','keywords','Триггеры'),copyButton(item));meta.append(heading);
    const tags=node('div','','library-trigger-list');
    for(const word of item.triggers){const tag=node('button',word);tag.type='button';tag.title='Скопировать триггер';tag.onclick=()=>copyKeywords(word,tag);tags.append(tag);}
    meta.append(tags);
  }
  if(item.description)meta.append(cardRow('p',item.description,'document','Описание','library-description'));
  if(item.url){const link=node('a','','library-civitai-link');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.append(node('span','Открыть на Civitai'),iconNode('civitai'));meta.append(link);}
  if(isCharacterLora(item))meta.prepend(characterSection(item,preferredName));else meta.append(addButton(item));
  body.append(meta);dialog.append(heading,body);syncSelectControls();dialog.showModal();
}

function render() {
  const query=$('lora-library-search').value.toLocaleLowerCase().trim(),base=$('lora-library-base').value;
  const visible=items.filter(item=>(category==='all'||categoryOf(item)===category)&&(base==='all'||item.base===base)&&[item.title,item.name,item.author,...item.tags,...item.triggers].join(' ').toLocaleLowerCase().includes(query));
  const grid=$('lora-library-grid');grid.replaceChildren();
  for(const item of visible) {
    const card=node('article','','library-card');card.dataset.name=item.name;
    const open=node('button','','library-open');open.type='button';open.setAttribute('aria-label',`Подробнее: ${item.title}`);open.onclick=()=>showDetails(item);open.append(preview(item));
    const type=categoryOf(item);
    const title=cardRow('strong',item.title,categoryIcons[type]||'tag',categories[type]||type,'library-card-title');
    const info=node('div','','library-card-info');info.append(title,cardRow('small',item.base,'palette','Базовая модель'));
    if(item.author)info.append(cardRow('small',item.author,'user-circle','Автор'));
    if(item.triggers.length)info.append(cardRow('p',item.triggers.join(', '),'keywords','Триггерворды','library-card-triggers'));
    const actions=node('div','','library-card-actions');actions.append(addButton(item,true),copyButton(item));
    const update=node('button','','library-update');update.type='button';update.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#icon-refresh"/></svg>';update.title='Обновить метаданные с Civitai';update.setAttribute('aria-label',`Обновить с Civitai: ${item.title}`);
    const message=node('small',item.warning,'library-card-status');message.setAttribute('role','status');
    update.onclick=async()=>{
      update.disabled=true;message.textContent='Поиск на Civitai…';
      try{const response=await fetch('/dashboard/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=items.map(old=>old.name===item.name?data:old);syncFilters();render();$('lora-library-status').textContent=`Обновлено с Civitai: ${data.title}`;}
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
  for(const base of [...new Set(items.map(item=>item.base))].sort())select.add(new Option(base,base));
  select.value=[...select.options].some(o=>o.value===value)?value:'all';syncSelectControls();
}

export async function loadLoraLibrary() {
  if(!initialized) {
    initialized=true;
    const root=node('section','','lora-library');root.id='lora-library';root.setAttribute('aria-labelledby','lora-library-title');
    root.innerHTML='<div class="library-heading"><h3 id="lora-library-title">Библиотека LoRA</h3><small id="lora-library-status" role="status" aria-live="polite"></small></div><div id="lora-library-categories" role="group" aria-label="Категория LoRA"></div><div class="library-filters"><input type="search" id="lora-library-search" placeholder="Название, автор или триггер…" aria-label="Поиск LoRA"><select id="lora-library-base" aria-label="Базовая модель LoRA"><option value="all">Все базовые модели</option></select></div><div id="lora-library-grid"></div>';
    $('lora-card').append(root);
    const standalone=$('add-character-btn');standalone.textContent='Персонаж без LoRA';standalone.title='Создать независимый образ без привязки к LoRA';root.querySelector('.library-heading').append(standalone);
    window.addEventListener('browse-characters',()=>{
      $('lora-library-search').value='';$('lora-library-base').value='all';category=items.some(item=>categoryOf(item)==='Character')?'Character':'all';syncFilters();render();
      document.querySelector('[data-mobile-panel=settings]').click();$('settings-tab-image').click();root.scrollIntoView({block:'start'});
    });
    window.addEventListener('edit-library-character',event=>{
      const {name,lora}=event.detail;const item=items.find(item=>item.name.replaceAll('\\','/')===lora.replaceAll('\\','/'));
      if(!item){window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:'LoRA персонажа не найдена в библиотеке. Обновите список моделей.'}));return;}
      showDetails(item,name);$('lora-library-details').querySelector('.configure-character').click();
    });
    const dialog=document.createElement('dialog');dialog.id='lora-library-details';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','library-detail-title');document.body.append(dialog);
    $('lora-library-search').addEventListener('input',render);$('lora-library-base').addEventListener('change',render);
    const syncAdded=()=>{for(const button of document.querySelectorAll('.library-add')){
      const managed=button.dataset.character==='true';
      button.disabled=managed?$('character-select').value!=='none'&&$('char-lora-select').value.replaceAll('\\','/')===button.dataset.loraName.replaceAll('\\','/'):activeLoras.some(lora=>lora.name===button.dataset.loraName);
      const label=button.disabled?'Подключено':managed?(charactersForLora(button.dataset.loraName).length?'Использовать персонажа':'Настроить персонажа'):'Добавить LoRA';
      const icon=button.querySelector('use');if(icon)icon.setAttribute('href',button.disabled?'#icon-check':'#icon-plus');else button.textContent=label;
      button.title=label;button.setAttribute('aria-label',`${label}: ${button.dataset.loraName}`);
    }};
    window.addEventListener('save-settings',syncAdded);window.addEventListener('settings-applied',syncAdded);
  }
  $('lora-library-status').textContent='Загрузка библиотеки…';
  try {const response=await fetch('/dashboard/lora-library',{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);items=data.items;syncFilters();render();}
  catch(error){$('lora-library-status').textContent=`Библиотека недоступна: ${error.message}`;}
}
