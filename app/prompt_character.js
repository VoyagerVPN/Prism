import {characterPromptPart} from './prompt_parts.js';
import {selectCharacterVariant,variantOptionLabel} from './character_variants.js';
import {promptCategoryIcon} from './lora_categories.js';

export function readCharacterToken(el) {
  const character=JSON.parse(el.dataset.character);
  const read=kind=>el.querySelector(`[data-character-field="${kind}"]`)?.textContent??'';
  character.appearances[character.activeAppearanceName]=read('appearance');
  character.appearance=read('appearance');
  if(character.outfitEnabled)character.outfits[character.activeOutfitName]=read('outfit');
  character.strength=Number(el.querySelector('.prompt-character-head').dataset.strength);
  return characterPromptPart(character);
}

export function createCharacterToken(part,{doc,onChange,openOptions}) {
  const c=characterPromptPart(part.character).character,el=doc.createElement('span');
  el.className='prompt-character';el.dataset.character=JSON.stringify(c);el.setAttribute('contenteditable','false');
  const head=doc.createElement('span');head.className='prompt-character-head';head.tabIndex=0;head.setAttribute('role','button');
  head.dataset.strength=String(c.strength);head.title='Выбрать внешность и одежду · Ctrl +/− или Ctrl+колёсико: вес LoRA';
  head.setAttribute('aria-label',`Персонаж ${c.name}: варианты и одежда`);
  const label=doc.createElement('span');label.textContent=c.name;
  const icon=promptCategoryIcon(doc,'Character');
  const weight=doc.createElement('span');weight.className='prompt-lora-weight';weight.textContent=String(c.strength);
  head.append(icon,label,weight);el.append(head);
  head.onclick=()=>openOptions(el);
  head.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openOptions(el);}};
  const group=(kind,text,icon,title)=>{
    const wrap=doc.createElement('span');wrap.className='prompt-character-group';wrap.dataset.tagKind=kind;wrap.title=`${c.name} · ${title}`;
    const mark=doc.createElement('span');mark.className='prompt-group-icon';mark.setAttribute('aria-hidden','true');
    mark.innerHTML=`<svg class="ui-icon"><use href="#icon-${icon}"/></svg>`;
    const field=doc.createElement('span');field.dataset.characterField=kind;field.setAttribute('contenteditable','true');field.setAttribute('role','textbox');field.setAttribute('aria-label',`${c.name} · ${title}`);field.dataset.placeholder=title;field.textContent=text;
    field.addEventListener('input',()=>onChange());wrap.append(mark,field);el.append(wrap);
  };
  group('appearance',c.appearance,'palette','Внешность');
  if(c.outfitEnabled)group('outfit',c.outfits[c.activeOutfitName],'shirt','Одежда');
  else {const disabled=doc.createElement('span');disabled.className='prompt-outfit-disabled';disabled.textContent='Одежда выключена';el.append(disabled);}
  return el;
}

export function characterOptions(el,{doc,onChange,replace,onSaveVariant,onEditLibrary,close}) {
  const panel=doc.createElement('div');panel.className='prompt-character-options';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Варианты персонажа');
  const heading=doc.createElement('strong');heading.textContent=readCharacterToken(el).character.name;panel.append(heading);
  const mutate=fn=>{const c=readCharacterToken(el).character;fn(c);el=replace(el,characterPromptPart(c));onChange();};
  const selects={};
  for(const [kind,title] of [['appearance','Внешность'],['outfit','Одежда']]){
    const label=doc.createElement('label');label.textContent=title;
    const select=doc.createElement('select');select.dataset.native='true';select.setAttribute('aria-label',`Вариант: ${title}`);selects[kind]=select;
    const c=readCharacterToken(el).character,map=kind==='appearance'?c.appearances:c.outfits;
    for(const key of Object.keys(map)){const option=doc.createElement('option');option.value=key;option.textContent=variantOptionLabel(c,kind,key);select.append(option);}
    select.value=c[kind==='appearance'?'activeAppearanceName':'activeOutfitName'];
    select.onchange=()=>{mutate(c=>selectCharacterVariant(c,kind,select.value));const c=readCharacterToken(el).character;selects.appearance.value=c.activeAppearanceName;selects.outfit.value=c.activeOutfitName;};
    label.append(select);panel.append(label);
  }
  const label=doc.createElement('label'),toggle=doc.createElement('input');toggle.type='checkbox';toggle.checked=readCharacterToken(el).character.outfitEnabled;toggle.setAttribute('aria-label','Включить одежду');
  toggle.onchange=()=>mutate(c=>{c.outfitEnabled=toggle.checked;});label.append(toggle,doc.createTextNode('Включить одежду'));panel.append(label);
  const status=doc.createElement('p');status.setAttribute('role','status');
  if(onSaveVariant)for(const [kind,title] of [['appearance','Сохранить внешность как вариант'],['outfit','Сохранить одежду как вариант']]){
    const button=doc.createElement('button');button.type='button';button.textContent=title;
    button.onclick=async()=>{button.disabled=true;try{const message=await onSaveVariant(readCharacterToken(el).character,kind);status.textContent=message??'';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};panel.append(button);
  }
  if(onEditLibrary){const edit=doc.createElement('button');edit.type='button';edit.textContent='Открыть шаблон в библиотеке';edit.onclick=()=>{onEditLibrary(readCharacterToken(el).character);close();};panel.append(edit);}
  const remove=doc.createElement('button');remove.type='button';remove.textContent='Убрать персонажа';remove.onclick=()=>{el.remove();onChange();close();};panel.append(remove);
  const done=doc.createElement('button');done.type='button';done.textContent='Готово';done.onclick=close;panel.append(status,done);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  return panel;
}
