import { askText, askConfirm } from './dialogs.js';
import { getSavedCharacters, saveCharactersDatabase, activateCharacter, renderCharacterSelect } from './characters.js';
import { syncSelectControls } from './controls.js';

const normalize = name => (name || '').replaceAll('\\','/');
const make = (tag,text,className) => {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
export const charactersForLora = name => Object.entries(getSavedCharacters()).filter(([,character])=>normalize(character.lora)===normalize(name));
export const isCharacterLora = item => normalize(item.name).split('/')[0].toLowerCase()==='character' || charactersForLora(item.name).length>0;

function tokens(words) {
  const result=[];
  for(const source of words) {
    let start=0,depth=0,escaped=false;
    for(let i=0;i<source.length;i++) {
      const char=source[i];
      if(escaped){escaped=false;continue;}
      if(char==='\\'){escaped=true;continue;}
      if(char==='('||char==='[')depth++;
      if(char===')'||char===']')depth=Math.max(0,depth-1);
      if(char===','&&depth===0){const word=source.slice(start,i).trim();if(word)result.push(word);start=i+1;}
    }
    const tail=source.slice(start).trim();if(tail)result.push(tail);
  }
  return [...new Set(result)];
}

async function storeCharacter(previousName, character) {
  const db=getSavedCharacters(),name=character.name.trim();
  if(!name||name==='none')throw new Error('Введите имя персонажа.');
  if(previousName!==name&&Object.hasOwn(db,name))throw new Error('Это имя уже занято.');
  if(previousName&&!Object.hasOwn(db,previousName))throw new Error('Персонаж был удалён. Обновите библиотеку.');
  if(previousName!==name)delete db[previousName];
  db[name]={...character,name};
  if(!await saveCharactersDatabase(db))throw new Error(document.getElementById('character-storage-status').textContent);
  const selected=document.getElementById('character-select').value;
  if(selected===previousName)activateCharacter(name);
  else renderCharacterSelect(selected);
  window.dispatchEvent(new Event('save-settings'));
  return name;
}

export async function useLibraryCharacter(name, outfit) {
  const db=getSavedCharacters(),character=db[name];
  if(!character)throw new Error('Сначала настройте персонажа.');
  if(outfit && Object.hasOwn(character.outfits,outfit) && outfit!==character.activeOutfitName) {
    character.activeOutfitName=outfit;
    if(!await saveCharactersDatabase(db))throw new Error(document.getElementById('character-storage-status').textContent);
  }
  activateCharacter(name);
}

export function characterSection(item, preferredName) {
  const section=make('section','','library-character');
  section.innerHTML='<h3>Персонаж и одежда</h3><label>Образ<select class="library-character-select" aria-label="Образ персонажа"></select></label><label class="library-outfit-label">Комплект одежды<select class="library-character-outfit" aria-label="Комплект для подключения"></select></label><div class="library-character-actions"><button type="button" class="configure-character">Настроить персонажа</button><button type="button" class="new-character-profile">Новый образ</button><button type="button" class="use-character">Использовать персонажа</button></div><small class="library-character-status" role="status"></small>';
  const select=section.querySelector('.library-character-select'),outfit=section.querySelector('.library-character-outfit'),status=section.querySelector('[role=status]');
  const fillOutfits=()=>{
    const character=getSavedCharacters()[select.value];outfit.replaceChildren();
    for(const name of Object.keys(character?.outfits||{}))outfit.add(new Option(name,name));
    if(character)outfit.value=character.activeOutfitName;
    section.querySelector('.library-outfit-label').hidden=!character;
    section.querySelector('.use-character').disabled=!character;
    section.querySelector('.new-character-profile').hidden=!character;
    status.textContent=character?'Основа и комплекты сохранены отдельно от данных автора.':'Разделите кейворды автора на основу образа и комплекты одежды.';
    syncSelectControls();
  };
  const refresh=name=>{
    const profiles=charactersForLora(item.name);select.replaceChildren();
    for(const [key] of profiles)select.add(new Option(key,key));
    if(!profiles.length)select.add(new Option('Ещё не настроен',''));
    const target=name||preferredName||document.getElementById('character-select').value;
    if(profiles.some(([key])=>key===target))select.value=target;
    fillOutfits();
  };
  select.onchange=fillOutfits;
  section.querySelector('.configure-character').onclick=()=>openCharacterSetup(item,select.value,refresh);
  section.querySelector('.new-character-profile').onclick=()=>openCharacterSetup(item,'',refresh);
  section.querySelector('.use-character').onclick=async()=>{
    try{await useLibraryCharacter(select.value,outfit.value);status.textContent='Персонаж подключён. Вес и одежда доступны в блоке активного персонажа.';}catch(error){status.textContent=error.message;}
  };
  refresh();return section;
}

export function openCharacterSetup(item, previousName='', onSaved=()=>{}) {
  const parent=document.getElementById('lora-library-details'),host=parent.querySelector('.library-detail-text');
  document.getElementById('library-character-editor')?.remove();
  const dialog=make('section');dialog.id='library-character-editor';dialog.setAttribute('aria-labelledby','profile-editor-title');host.prepend(dialog);
  parent.classList.add('editing-character');
  const close=()=>{dialog.remove();parent.classList.remove('editing-character');parent.querySelector('.configure-character')?.focus();};
  parent.onclose=close;
  const existing=getSavedCharacters()[previousName];
  const draft=structuredClone(existing||{name:item.title,lora:item.name,strength:1,appearance:'',outfits:{'По умолчанию':''},activeOutfitName:'По умолчанию',outfitEnabled:true});
  draft.lora=item.name;
  let active=draft.activeOutfitName;
  dialog.innerHTML='<form><h3 id="profile-editor-title">Настройка персонажа</h3><label>Имя образа<input id="profile-character-name" type="text" required maxlength="200"></label><div class="profile-editor-fields"><label>Основа образа<textarea id="profile-character-base" placeholder="Триггер персонажа, лицо, волосы, глаза…"></textarea></label><div><label>Комплект одежды<select id="profile-outfit-select" aria-label="Редактируемый комплект"></select></label><div class="profile-outfit-actions"><button type="button" id="profile-add-outfit">Добавить</button><button type="button" id="profile-rename-outfit">Переименовать</button><button type="button" id="profile-delete-outfit">Удалить</button></div><label>Кейворды комплекта<textarea id="profile-outfit-text" placeholder="Одежда и аксессуары этого комплекта…"></textarea></label></div></div><section class="profile-source"><h3>Кейворды автора</h3><p>Отметьте теги и добавьте их в основу или выбранный комплект. Исходный список автора сохраняется.</p><div id="profile-source-tags"></div><div class="profile-tag-actions"><button type="button" id="profile-select-tags">Выбрать все</button><button type="button" id="profile-tags-base">В основу</button><button type="button" id="profile-tags-outfit">В комплект</button></div></section><p id="profile-editor-status" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" id="profile-delete-character">Удалить образ</button><button type="button" class="close-profile-editor">Отмена</button><button type="submit" id="profile-save-character" class="dialog-primary">Сохранить</button></div></form>';
  const $=id=>dialog.querySelector('#'+id),name=$('profile-character-name'),base=$('profile-character-base'),outfit=$('profile-outfit-text'),select=$('profile-outfit-select'),status=$('profile-editor-status');
  name.value=draft.name;base.value=draft.appearance;outfit.value=draft.outfits[active]||'';
  const updateSelect=()=>{select.replaceChildren();for(const key of Object.keys(draft.outfits))select.add(new Option(key,key));select.value=active;outfit.value=draft.outfits[active];$('profile-delete-outfit').disabled=Object.keys(draft.outfits).length<=1;syncSelectControls();};
  outfit.oninput=()=>{draft.outfits[active]=outfit.value;};
  select.onchange=()=>{draft.outfits[active]=outfit.value;active=select.value;outfit.value=draft.outfits[active];};
  $('profile-add-outfit').onclick=async()=>{
    const value=await askText('Название комплекта:','',{title:'Новый комплект'});
    if(!value)return;if(Object.hasOwn(draft.outfits,value)){status.textContent='Комплект с таким именем уже есть.';return;}
    draft.outfits[active]=outfit.value;draft.outfits[value]='';active=value;updateSelect();
  };
  $('profile-rename-outfit').onclick=async()=>{
    const value=await askText('Новое название комплекта:',active);
    if(!value||value===active)return;if(Object.hasOwn(draft.outfits,value)){status.textContent='Комплект с таким именем уже есть.';return;}
    draft.outfits[value]=outfit.value;delete draft.outfits[active];active=value;updateSelect();
  };
  $('profile-delete-outfit').onclick=async()=>{
    if(Object.keys(draft.outfits).length<=1||!await askConfirm(`Удалить комплект «${active}» из этого образа?`))return;
    delete draft.outfits[active];active=Object.keys(draft.outfits)[0];updateSelect();
  };
  const tagList=$('profile-source-tags');
  for(const word of tokens(item.triggers)) {const label=make('label','','profile-source-tag'),check=document.createElement('input');check.type='checkbox';check.value=word;label.append(check,make('span',word));tagList.append(label);}
  if(!tagList.children.length)tagList.append(make('p','У автора нет кейвордов. Заполните основу и одежду вручную.'));
  const checked=()=>[...tagList.querySelectorAll('input:checked')];
  const syncTags=()=>{const empty=!checked().length;$('profile-tags-base').disabled=empty;$('profile-tags-outfit').disabled=empty;};
  tagList.onchange=syncTags;
  $('profile-select-tags').onclick=()=>{const inputs=[...tagList.querySelectorAll('input')],value=inputs.some(input=>!input.checked);for(const input of inputs)input.checked=value;syncTags();};
  const append=target=>{const current=new Set(tokens([target.value])),add=checked().map(input=>input.value).filter(value=>!current.has(value));target.value=[target.value.trim(),...add].filter(Boolean).join(', ');target.dispatchEvent(new Event('input'));for(const input of checked())input.checked=false;syncTags();status.textContent=`Добавлено тегов: ${add.length}`;};
  $('profile-tags-base').onclick=()=>append(base);$('profile-tags-outfit').onclick=()=>append(outfit);
  for(const button of dialog.querySelectorAll('.close-profile-editor'))button.onclick=()=>close();
  $('profile-delete-character').hidden=!existing;
  $('profile-delete-character').onclick=async()=>{
    if(!await askConfirm(`Удалить образ «${previousName}» и его комплекты? Файл LoRA останется в библиотеке.`))return;
    const db=getSavedCharacters();delete db[previousName];
    if(!await saveCharactersDatabase(db)){status.textContent=document.getElementById('character-storage-status').textContent;return;}
    if(document.getElementById('character-select').value===previousName)activateCharacter('none');else renderCharacterSelect(document.getElementById('character-select').value);
    window.dispatchEvent(new Event('save-settings'));close();onSaved('');
  };
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();draft.name=name.value.trim();draft.appearance=base.value;draft.outfits[active]=outfit.value;draft.activeOutfitName=active;
    const button=$('profile-save-character');button.disabled=true;status.textContent='Сохранение…';
    try{const saved=await storeCharacter(previousName,draft);close();onSaved(saved);}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  updateSelect();syncTags();name.focus();
}
