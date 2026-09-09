import { splitPromptTags as tokens, createTagInput } from './tag_input.js';
import { selectCharacterVariant, toggleCharacterVariantLink, renameCharacterVariantLink, renderVariantLink, variantName, variantOptionLabel } from './character_variants.js';
import { createEditableChoice } from './editable_choice.js';
import { serializePrism } from './character_format.js';
import { askConfirm } from './dialogs.js';
import { getSavedCharacters, saveCharactersDatabase, activateCharacter, renderCharacterSelect, loadCharacterData } from './characters.js';
import {setPromptCharacterActions} from './prompt_editor.js';
import {askText} from './dialogs.js';
import {readPreferences} from './preferences.js';
import { syncSelectControls } from './controls.js';

const normalize = name => (name || '').replaceAll('\\','/');
const make = (tag,text,className) => {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
export const charactersForLora = name => Object.entries(getSavedCharacters()).filter(([,character])=>normalize(character.lora)===normalize(name));
export const isCharacterLora = item => normalize(item.name).split('/')[0].toLowerCase()==='character' || charactersForLora(item.name).length>0;

async function storeCharacter(previousName, character) {
  serializePrism(character);
  const db=getSavedCharacters(),name=character.name.trim();
  if(!name||name==='none')throw new Error('Введите имя персонажа.');
  if(previousName!==name&&Object.hasOwn(db,name))throw new Error('Это имя уже занято.');
  if(previousName&&!Object.hasOwn(db,previousName))throw new Error('Персонаж был удалён. Обновите библиотеку.');
  if(previousName!==name)delete db[previousName];
  db[name]={...character,name};
  if(!await saveCharactersDatabase(db))throw new Error(document.getElementById('character-storage-status').textContent);
  const selected=document.getElementById('character-select').value;
  if(selected===previousName){renderCharacterSelect(name);loadCharacterData(name);}
  else renderCharacterSelect(selected);
  window.dispatchEvent(new Event('save-settings'));
  return name;
}

export async function useLibraryCharacter(name, outfit) {
  const db=getSavedCharacters(),character=db[name];
  if(!character)throw new Error('Сначала настройте персонажа.');
  if(outfit && Object.hasOwn(character.outfits,outfit) && outfit!==character.activeOutfitName) {
    character.activeOutfitName=outfit;
  }
  activateCharacter(name,character);
}

setPromptCharacterActions({
  edit:character=>window.dispatchEvent(new CustomEvent('edit-library-character',{detail:{name:character.name,lora:character.lora}})),
  saveVariant:async(character,kind)=>{
    const name=await askText('Название нового варианта','',{title:kind==='appearance'?'Сохранить внешность':'Сохранить одежду'});if(name===null)return '';
    if(name.length>200||['__proto__','constructor','prototype','none'].includes(name))throw new Error('Недопустимое название варианта.');
    const db=getSavedCharacters(),saved=db[character.name];if(!saved)throw new Error('Персонаж отсутствует в библиотеке. Сначала сохраните его шаблон.');
    const field=kind==='appearance'?'appearances':'outfits',active=kind==='appearance'?'activeAppearanceName':'activeOutfitName';
    if(Object.hasOwn(saved[field],name)||Object.keys(saved[field]).some(key=>variantName(saved,kind,key)===name))throw new Error('Вариант с таким именем уже существует.');
    saved[field][name]=character[field][character[active]];
    saved.variantNames??={};saved.variantNames[kind]??={};saved.variantNames[kind][name]=name;
    if(!await saveCharactersDatabase(db))throw new Error(document.getElementById('character-storage-status').textContent);
    return `Вариант «${name}» сохранён в библиотеке.`;
  }
});

export function openCharacterSetup(item, previousName='', onSaved=()=>{}, libraryItems=[], importedCharacter=null) {
  const parent=document.getElementById('lora-library-details'),host=parent.querySelector('.library-detail-text');
  document.getElementById('library-character-editor')?.dispatchEvent(new Event('dispose-editor'));
  document.getElementById('library-character-editor')?.remove();
  const dialog=make('section');dialog.id='library-character-editor';dialog.setAttribute('aria-labelledby','profile-editor-title');host.prepend(dialog);
  parent.classList.add('editing-character');
  const tagInputs=new Map();
  const choices=[];
  const dispose=()=>{for(const input of tagInputs.values())input.destroy();tagInputs.clear();for(const choice of choices)choice.destroy();choices.length=0;};
  dialog.addEventListener('dispose-editor',dispose,{once:true});
  const close=()=>parent.close();
  parent.onclose=()=>{dispose();dialog.remove();parent.classList.remove('editing-character');};
  const existing=getSavedCharacters()[previousName];
  const draft=structuredClone(importedCharacter||existing||{name:item.title,lora:item.name,strength:1,appearance:'',outfits:{'По умолчанию':''},activeOutfitName:'По умолчанию',outfitEnabled:true});
  draft.lora=importedCharacter?.lora??item.name;
  const sourceMetadata=entry=>Object.fromEntries(['title','author','url','base','version','description','tags','triggers'].filter(key=>entry?.[key]!==undefined).map(key=>[key,entry[key]]));
  draft.source??=sourceMetadata(item.name==='None'?null:item);
  draft.appearances??={'По умолчанию':draft.appearance||''};
  draft.activeAppearanceName??=Object.keys(draft.appearances)[0];
  draft.trigger??='';
  if(!existing&&!importedCharacter){
    const preferences=readPreferences();
    draft.variantNames={appearance:{[draft.activeAppearanceName]:preferences.initialAppearanceName},outfit:{[draft.activeOutfitName]:preferences.initialOutfitName}};
    draft.outfitEnabled=preferences.initialOutfitEnabled;
  }
  dialog.innerHTML='<form><h3 id="profile-editor-title" class="profile-section-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-person"/></svg><span>Настройка персонажа</span></h3><section class="profile-editor-section"><label>Имя персонажа<input id="profile-character-name" type="text" required maxlength="200"></label></section><div class="profile-editor-fields"><section class="profile-editor-section" aria-labelledby="profile-base-title"><h3 id="profile-base-title" class="profile-section-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-palette"/></svg><span>Внешность</span></h3><label class="visually-hidden" for="profile-character-base">Внешность</label><textarea id="profile-character-base" placeholder="Лицо, волосы, глаза этого варианта…"></textarea></section><section class="profile-editor-section" aria-labelledby="profile-outfit-title"><h3 id="profile-outfit-title" class="profile-section-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-shirt"/></svg><span>Комплект одежды</span></h3><label class="visually-hidden" for="profile-outfit-select">Редактируемый комплект</label><select id="profile-outfit-select" aria-label="Редактируемый комплект"></select><label class="visually-hidden" for="profile-outfit-text">Одежда и аксессуары</label><textarea id="profile-outfit-text" placeholder="Одежда и аксессуары этого комплекта…"></textarea></section></div><section class="profile-source profile-editor-section" aria-labelledby="profile-source-title"><h3 id="profile-source-title" class="profile-section-title"><svg class="ui-icon" aria-hidden="true"><use href="#icon-keywords"/></svg><span>Кейворды автора</span></h3><p>Выберите поле и нажимайте на теги автора. Свои теги можно вводить или вставлять списком; двойной клик редактирует плашку.</p><div id="profile-source-tags"></div></section><p id="profile-editor-status" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" id="profile-export-character">Экспорт .prism</button><button type="button" id="profile-delete-character">Удалить персонажа</button><button type="button" class="close-profile-editor">Отмена</button><button type="submit" id="profile-save-character">Сохранить</button><button type="submit" id="profile-use-character" class="dialog-primary">Сохранить и использовать</button></div></form>';
  const $=id=>dialog.querySelector('#'+id),name=$('profile-character-name'),base=$('profile-character-base'),outfit=$('profile-outfit-text'),select=$('profile-outfit-select'),status=$('profile-editor-status');
  const saveOnEnter=()=>{const button=$('profile-save-character');if(!button.disabled)dialog.querySelector('form').requestSubmit(button);};
  const identity=name.closest('section');
  identity.classList.add('profile-identity');
  const universeLabel=make('label','Вселенная');
  const universes=new Map();
  for(const value of [draft.universe,...Object.values(getSavedCharacters()).map(character=>character.universe)]){const text=value?.trim();if(text&&!universes.has(text.toLocaleLowerCase('ru')))universes.set(text.toLocaleLowerCase('ru'),text);}
  const universeChoice=createEditableChoice({id:'profile-character-universe',label:'Вселенная',placeholder:'Укажите вселенную',maxLength:500,filter:true,onEnter:saveOnEnter,
    readName:()=>draft.universe||'',commitName:value=>{if(value.length>500)return false;draft.universe=value;return true;},
    options:()=>[...universes.values()].sort((a,b)=>a.localeCompare(b,'ru')).map(value=>({value,label:value,selected:value===draft.universe})),choose:value=>{draft.universe=value;}});
  choices.push(universeChoice);const universe=universeChoice.input;universeLabel.append(universeChoice.root);
  const descriptionLabel=make('label','Описание персонажа'),description=document.createElement('textarea');description.id='profile-character-description';description.placeholder='Заметки о персонаже (не добавляются в промпт)';description.value=draft.description||'';descriptionLabel.append(description);
  identity.append(universeLabel,descriptionLabel);
  const profiles=charactersForLora(item.name);
  if(profiles.length>1&&previousName) {
    const label=make('label','Сохранённый персонаж'),picker=document.createElement('select');picker.setAttribute('aria-label','Сохранённый персонаж');
    for(const [key] of profiles)picker.add(new Option(key,key));picker.value=previousName;
    picker.onchange=()=>onSaved(picker.value);label.classList.add('profile-identity-wide');label.append(picker);identity.prepend(label);
  }
  const loraLabel=make('label','LoRA (необязательно)'),lora=document.createElement('select');lora.id='profile-character-lora';lora.setAttribute('aria-label','LoRA персонажа');
  lora.add(new Option('Без LoRA','None'));
  for(const entry of libraryItems)lora.add(new Option(entry.title,entry.name));
  if(item.name!=='None'&&![...lora.options].some(option=>option.value===item.name))lora.add(new Option(`Не установлена: ${item.name}`,item.name));
  lora.value=draft.lora;loraLabel.append(lora);identity.append(loraLabel);
  const triggerLabel=make('label','Триггерворд — общий для всех вариантов'),trigger=document.createElement('input');
  trigger.type='text';trigger.id='profile-character-trigger';trigger.value=draft.trigger;
  trigger.placeholder='Постоянный триггер персонажа';triggerLabel.append(trigger);identity.append(triggerLabel);
  descriptionLabel.classList.add('profile-identity-wide');identity.append(descriptionLabel);
  const labelIcon=(label,icon)=>{const text=label.firstChild;if(text?.nodeType!==3)return;const heading=make('span','','profile-label-heading');heading.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg>`;heading.append(text);label.prepend(heading);};
  for(const [label,icon] of [[name.closest('label'),'person'],[universeLabel,'globe'],[loraLabel,'layers'],[triggerLabel,'keywords'],[descriptionLabel,'edit']])labelIcon(label,icon);
  name.value=draft.name;
  // Одинаковое управление вариантами, тексты остаются в черновике до сохранения.
  const editors={};
  let variantsReady=false;
  const variantEditor=(kind,values,activeName,field,picker)=>{
    let current=activeName;
    const freeKey=()=>{let index=1;while(Object.hasOwn(values,`variant_${index}`))index++;return `variant_${index}`;};
    picker.dataset.native='true';picker.hidden=true;
    const row=make('div','','profile-variant-row');picker.before(row);row.append(picker);
    let choice;
    const read=()=>{tagInputs.get(field)?.read();values[current]=field.value;draft[kind==='appearance'?'activeAppearanceName':'activeOutfitName']=current;return current;};
    const update=()=>{picker.replaceChildren();for(const key of Object.keys(values))picker.add(new Option(variantOptionLabel(draft,kind,key),key));picker.value=current;draft[kind==='appearance'?'activeAppearanceName':'activeOutfitName']=current;field.value=values[current];tagInputs.get(field)?.sync(field.value);choice?.sync();if(variantsReady)syncSelectControls();dialog.dispatchEvent(new Event('tags-updated'));};
    const rename=value=>{
      if(value===variantName(draft,kind,current))return true;
      if(value.length>200||['none','__proto__','constructor','prototype'].includes(value)){status.textContent='Недопустимое название варианта.';return false;}
      if(value&&Object.keys(values).some(key=>key!==current&&variantName(draft,kind,key)===value)){status.textContent='Вариант с таким именем уже есть.';return false;}
      read();draft.variantNames??={};draft.variantNames[kind]??={};
      if(!value)draft.variantNames[kind][current]='';
      else {
        const next=value!==current&&Object.hasOwn(values,value)?freeKey():value;
        if(next!==current){values[next]=values[current];delete values[current];renameCharacterVariantLink(draft,kind,current,next);}
        delete draft.variantNames[kind][current];current=next;
        if(next!==value)draft.variantNames[kind][next]=value;
      }
      update();status.textContent='';return true;
    };
    choice=createEditableChoice({id:`profile-${kind}-name`,label:kind==='appearance'?'Название внешности':'Название комплекта',placeholder:'Название варианта',maxLength:200,onEnter:saveOnEnter,
      readName:()=>variantName(draft,kind,current),commitName:rename,
      options:()=>Object.keys(values).map(value=>({value,label:variantOptionLabel(draft,kind,value),selected:value===current})),
      choose:value=>{picker.value=value;picker.dispatchEvent(new Event('change'));}});
    choices.push(choice);row.append(choice.root);
    const actions=[['add','plus','Добавить'],['duplicate','copy','Дублировать']];
    for(const [action,icon,label] of actions){
      const button=make('button');button.type='button';button.id=`profile-${action}-${kind}`;button.className='icon-btn-sm';
      const accessible=label+(kind==='appearance'?' вариант внешности':' комплект одежды');button.title=accessible;button.setAttribute('aria-label',accessible);
      button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg>`;row.append(button);
      button.onclick=()=>{
        if(!choice.commit())return;
        read();const value=freeKey();
        values[value]=action==='add'?'':field.value;
        draft.variantNames??={};draft.variantNames[kind]??={};draft.variantNames[kind][value]='';
        current=value;update();read();renderVariantLink(linkButton,draft);status.textContent='';choice.focus();
      };
    }
    editors[kind]={read,refresh:()=>{current=draft[kind==='appearance'?'activeAppearanceName':'activeOutfitName'];update();}};
    field.oninput=()=>read();picker.onchange=()=>{
      const next=picker.value.trim();
      if(!next||next.length>200||['none','__proto__','constructor','prototype'].includes(next)){update();return;}
      for(const editor of Object.values(editors))editor.read();
      if(!Object.hasOwn(values,next)){update();return;}
      selectCharacterVariant(draft,kind,next);
      for(const editor of Object.values(editors))editor.refresh();
      renderVariantLink(linkButton,draft);status.textContent='';
    };update();return read;
  };
  const appearanceSelect=document.createElement('select');appearanceSelect.id='profile-appearance-select';appearanceSelect.setAttribute('aria-label','Вариант внешности');base.before(appearanceSelect);
  const readAppearance=variantEditor('appearance',draft.appearances,draft.activeAppearanceName,base,appearanceSelect);
  const readOutfit=variantEditor('outfit',draft.outfits,draft.activeOutfitName,outfit,select);
  // Сначала размещаем оба select, затем создаём их динамические оболочки.
  variantsReady=true;syncSelectControls();
  const linkButton=make('button','','icon-btn-sm profile-variant-link');linkButton.type='button';linkButton.id='profile-variant-link';
  const variantFields=dialog.querySelector('.profile-editor-fields');variantFields.insertBefore(linkButton,variantFields.children[1]);
  linkButton.onclick=()=>{readAppearance();readOutfit();toggleCharacterVariantLink(draft);renderVariantLink(linkButton,draft);};renderVariantLink(linkButton,draft);
  const tagList=$('profile-source-tags');
  const destinations=[{field:trigger,kind:'trigger',label:'Триггер',icon:'keywords'},{field:base,kind:'appearance',label:'Внешность',icon:'palette'},{field:outfit,kind:'outfit',label:'Одежда',icon:'shirt'}];
  let target=destinations[1];
  const routing=make('div','','tag-routing'),targetStatus=make('p');targetStatus.id='profile-tag-target';targetStatus.setAttribute('role','status');
  const targetButtons=make('div','','tag-targets');targetButtons.setAttribute('role','group');targetButtons.setAttribute('aria-label','Куда добавлять теги');routing.append(targetStatus,targetButtons);tagList.before(routing);
  const syncTags=()=>{
    const key=target.kind==='appearance'?draft.activeAppearanceName:target.kind==='outfit'?draft.activeOutfitName:'';
    const variant=key?variantOptionLabel(draft,target.kind,key):'';
    targetStatus.textContent=`Добавляем: ${target.label}${variant?' · '+variant:''}`;
    for(const destination of destinations){tagInputs.get(destination.field)?.setActive(destination===target);destination.button.setAttribute('aria-pressed',String(destination===target));}
    for(const button of tagList.querySelectorAll('button[data-word]')){
      const assigned=destinations.filter(destination=>tagInputs.get(destination.field)?.values().includes(button.dataset.word));
      button.dataset.assigned=assigned.map(destination=>destination.kind).join(' ');
      button.title=assigned.length?'Уже добавлен: '+assigned.map(destination=>destination.label).join(', '):'Добавить: '+target.label;
      button.setAttribute('aria-label',button.dataset.word+'. '+button.title);
      const marks=button.querySelector('.tag-assignments');marks.replaceChildren();
      for(const destination of assigned){const mark=make('span','','tag-assignment');mark.dataset.tagKind=destination.kind;mark.title=destination.label;mark.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${destination.icon}"/></svg>`;marks.append(mark);}
    }
  };
  for(const destination of destinations){
    const button=make('button');button.type='button';button.dataset.tagKind=destination.kind;button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${destination.icon}"/></svg>`;button.append(make('span',destination.label));destination.button=button;targetButtons.append(button);
    button.onclick=()=>{target=destination;syncTags();tagInputs.get(destination.field).focus();};
  }
  for(const destination of destinations)tagInputs.set(destination.field,createTagInput(destination.field,{...destination,onChange:syncTags,onFocus:()=>{target=destination;syncTags();}}));
  const renderTags=()=>{
    tagList.replaceChildren();
    for(const word of tokens(draft.source?.triggers||[])){
      const button=make('button','','profile-source-tag');button.type='button';button.dataset.word=word;button.append(make('span',word),make('span','','tag-assignments'));
      button.onclick=()=>{tagInputs.get(target.field).add(word);syncTags();};tagList.append(button);
    }
    if(!tagList.children.length)tagList.append(make('p','Нет кейвордов автора. Введите свои теги в поля выше.'));
    syncTags();
  };
  const missingLora=()=>lora.value!=='None'&&!libraryItems.some(entry=>entry.name===lora.value);
  const availability=make('p','','profile-lora-status');availability.setAttribute('role','status');loraLabel.append(availability);
  const syncLora=()=>{const missing=missingLora();availability.textContent=missing?`LoRA не установлена: ${lora.value}. Можно сохранить персонажа, затем установить модель или выбрать другую.`:'';$('profile-use-character').disabled=missing;};
  lora.onchange=()=>{draft.lora=lora.value;draft.source=sourceMetadata(libraryItems.find(entry=>entry.name===lora.value));renderTags();syncLora();};
  syncLora();renderTags();
  dialog.querySelector('.profile-editor-fields').addEventListener('change',syncTags);
  dialog.addEventListener('tags-updated',syncTags);
  for(const button of dialog.querySelectorAll('.close-profile-editor'))button.onclick=()=>close();
  $('profile-delete-character').hidden=!existing;
  $('profile-delete-character').onclick=async()=>{
    if(!await askConfirm(`Удалить персонажа «${previousName}» и его комплекты? Файл LoRA останется в библиотеке.`))return;
    const db=getSavedCharacters();delete db[previousName];
    if(!await saveCharactersDatabase(db)){status.textContent=document.getElementById('character-storage-status').textContent;return;}
    if(document.getElementById('character-select').value===previousName)activateCharacter('none');else renderCharacterSelect(document.getElementById('character-select').value);
    window.dispatchEvent(new Event('save-settings'));close();
  };
  const readDraft=()=>{for(const choice of choices)if(!choice.commit())throw new Error(status.textContent||'Проверьте название.');draft.name=name.value.trim();draft.universe=universe.value.trim();draft.description=description.value;draft.activeAppearanceName=readAppearance();draft.appearance=base.value;draft.trigger=tagInputs.get(trigger).read();draft.lora=lora.value;draft.activeOutfitName=readOutfit();return draft;};
  $('profile-export-character').onclick=()=>{
    try{
      const text=serializePrism(readDraft()),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
      link.href=url;link.download=(draft.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'')||'character')+'.prism';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Карточка экспортирована';
    }catch(error){status.textContent=error.message;}
  };
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();try{readDraft();}catch(error){status.textContent=error.message;return;}
    const use=event.submitter?.id==='profile-use-character';if(use&&missingLora()){status.textContent='Сначала подключите установленную LoRA или выберите «Без LoRA».';return;}const button=$('profile-save-character'),useButton=$('profile-use-character');button.disabled=true;useButton.disabled=true;status.textContent='Сохранение…';
    try{const saved=await storeCharacter(previousName,draft);previousName=saved;$('profile-delete-character').hidden=false;if(use){await useLibraryCharacter(saved);close();}else{status.textContent='Персонаж сохранён';}}catch(error){status.textContent=error.message;}finally{button.disabled=false;syncLora();}
  };
  syncTags();name.focus();
}
