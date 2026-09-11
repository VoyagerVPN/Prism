import {characterPromptPart,normalizePromptParts} from './prompt_parts.js';
import {selectCharacterVariant,variantOptionLabel} from './character_variants.js';
import {promptCategoryIcon} from './lora_categories.js';

export function readCharacterToken(el) {
  const character=JSON.parse(el.dataset.character);
  const read=kind=>el.querySelector(`[data-character-field="${kind}"]`)?.textContent??'';
  character.appearances[character.activeAppearanceName]=read('appearance');
  character.appearance=read('appearance');
  if(character.outfitEnabled)character.outfits[character.activeOutfitName]=read('outfit');
  character.strength=Number(el.querySelector('.prompt-character-head').dataset.strength);
  return characterPromptPart(character,{instanceId:el.dataset.instanceId,framePrompt:read('frame'),disabledTags:JSON.parse(el.dataset.disabledTags??'[]')});
}

export function createCharacterToken(part,{doc,onChange,onSelect,onHover,onHoverEnd,openOptions}) {
  const normalized=normalizePromptParts([part])[0],c=normalized.character,el=doc.createElement('span');
  el.dataset.instanceId=normalized.instanceId;
  el.dataset.disabledTags=JSON.stringify(normalized.disabledTags);
  el.className='prompt-character';el.dataset.character=JSON.stringify(c);el.setAttribute('contenteditable','false');
  const head=doc.createElement('span');head.className='prompt-character-head';head.tabIndex=0;head.setAttribute('role','button');
  head.dataset.strength=String(c.strength);head.title='Выделить персонажа · Колесо: вес LoRA · Повторный щелчок или Enter: меню';head.setAttribute('aria-pressed','false');
  head.setAttribute('aria-label',`Персонаж ${c.name}: варианты и одежда`);
  const label=doc.createElement('span');label.className='prompt-character-name';label.textContent=c.name;label.title=c.name;
  const icon=promptCategoryIcon(doc,'Character');
  const weight=doc.createElement('span');weight.className='prompt-lora-weight';weight.textContent=String(c.strength);
  const summary=doc.createElement('span');summary.className='prompt-character-summary';head.append(icon,label,weight);summary.append(head);el.append(summary);
  head.onclick=()=>onSelect(el,'character');
  head.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openOptions(el);}};
  for(const [kind,key,title] of [['appearance',c.activeAppearanceName,'Внешность'],['outfit',c.activeOutfitName,'Одежда']]){
    const choice=doc.createElement('span');choice.dataset.characterVariant=kind;choice.className='prompt-character-variant';choice.tabIndex=0;choice.setAttribute('role','button');
    const mark=doc.createElement('span');mark.className='prompt-category-icon';mark.setAttribute('aria-hidden','true');mark.innerHTML=`<svg class="ui-icon"><use href="#icon-${kind==='appearance'?'palette':'shirt'}"/></svg>`;
    const name=doc.createElement('span');name.className='prompt-character-variant-name';name.textContent=kind==='outfit'&&!c.outfitEnabled?'Без одежды':variantOptionLabel(c,kind,key);choice.append(mark,name);
    choice.title=`${title}: ${name.textContent} · Выделите и крутите колесо · Повторный щелчок или Enter: меню`;choice.setAttribute('aria-label',`${c.name} · Выбрать ${kind==='appearance'?'внешность':'одежду'}`);choice.setAttribute('aria-pressed','false');
    choice.onclick=()=>onSelect(el,kind);choice.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openOptions(el,kind);}};
    choice.onpointerenter=()=>onHover(el,kind);choice.onpointerleave=onHoverEnd;
    summary.append(choice);
  }
  const group=(kind,text,icon,title)=>{
    const wrap=doc.createElement('span');wrap.className='prompt-character-group';wrap.dataset.tagKind=kind;wrap.title=`${c.name} · ${title}`;
    const mark=doc.createElement('span');mark.className='prompt-group-icon';mark.setAttribute('aria-hidden','true');
    mark.innerHTML=`<svg class="ui-icon"><use href="#icon-${icon}"/></svg>`;
    const field=doc.createElement('span');field.dataset.characterField=kind;field.setAttribute('contenteditable','true');field.setAttribute('role','textbox');field.setAttribute('aria-label',`${c.name} · ${title}`);field.dataset.placeholder=title;field.textContent=text;
    field.addEventListener('input',()=>onChange());wrap.append(mark,field);wrap.hidden=true;el.append(wrap);
  };
  const frameWrap=doc.createElement('span');frameWrap.className='prompt-frame';
  const frame=doc.createElement('span');frame.dataset.characterField='frame';frame.setAttribute('contenteditable','true');frame.setAttribute('role','textbox');frame.setAttribute('aria-label',`${c.name} · В этом кадре`);frame.textContent=normalized.framePrompt;
  const updateFrameState=()=>frameWrap.classList.toggle('is-empty',!frame.textContent);
  frame.addEventListener('input',()=>{updateFrameState();onChange();});frameWrap.append(frame);updateFrameState();el.append(frameWrap);
  group('appearance',c.appearance,'palette','Внешность');
  if(c.outfitEnabled)group('outfit',c.outfits[c.activeOutfitName],'shirt','Одежда');
  return el;
}

export function characterOptions(el,{doc,onChange,replace,onSaveVariant,onEditLibrary,onShowTags,close,section}) {
  const panel=doc.createElement('div');panel.className='prompt-character-options';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Варианты персонажа');
  const heading=doc.createElement('strong');heading.textContent=readCharacterToken(el).character.name;panel.append(heading);
  const mutate=fn=>{const part=readCharacterToken(el);fn(part.character);el=replace(el,part);onChange();};
  const selects={};
  for(const [kind,title] of [['appearance','Внешность'],['outfit','Одежда']]){
    if(section&&section!==kind)continue;
    const label=doc.createElement('label');label.textContent=title;
    const select=doc.createElement('select');select.dataset.native='true';select.setAttribute('aria-label',`Вариант: ${title}`);selects[kind]=select;
    const c=readCharacterToken(el).character,map=kind==='appearance'?c.appearances:c.outfits;
    for(const key of Object.keys(map)){const option=doc.createElement('option');option.value=key;option.textContent=variantOptionLabel(c,kind,key);select.append(option);}
    select.value=c[kind==='appearance'?'activeAppearanceName':'activeOutfitName'];
    select.onchange=()=>{mutate(c=>selectCharacterVariant(c,kind,select.value));const c=readCharacterToken(el).character;if(selects.appearance)selects.appearance.value=c.activeAppearanceName;if(selects.outfit)selects.outfit.value=c.activeOutfitName;};
    label.append(select);panel.append(label);
  }
  const label=doc.createElement('label'),toggle=doc.createElement('input');toggle.type='checkbox';toggle.checked=readCharacterToken(el).character.outfitEnabled;toggle.setAttribute('aria-label','Включить одежду');
  toggle.onchange=()=>mutate(c=>{c.outfitEnabled=toggle.checked;});label.append(toggle,doc.createTextNode('Включить одежду'));if(section!=='appearance')panel.append(label);
  const expand=doc.createElement('button');expand.type='button';
  expand.textContent='Теги внешности и одежды';expand.onclick=()=>{close();onShowTags(el,section);};panel.append(expand);
  const status=doc.createElement('p');status.setAttribute('role','status');
  if(onSaveVariant)for(const [kind,title] of [['appearance','Сохранить внешность как вариант'],['outfit','Сохранить одежду как вариант']]){
    if(section&&section!==kind)continue;
    const button=doc.createElement('button');button.type='button';button.textContent=title;
    button.onclick=async()=>{button.disabled=true;try{const message=await onSaveVariant(readCharacterToken(el).character,kind);status.textContent=message??'';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};panel.append(button);
  }
  if(onEditLibrary){const edit=doc.createElement('button');edit.type='button';edit.textContent='Открыть шаблон в библиотеке';edit.onclick=()=>{onEditLibrary(readCharacterToken(el).character);close();};panel.append(edit);}
  const remove=doc.createElement('button');remove.type='button';remove.textContent='Убрать персонажа';remove.onclick=()=>{el.remove();onChange();close();};panel.append(remove);
  const done=doc.createElement('button');done.type='button';done.textContent='Готово';done.onclick=close;panel.append(status,done);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  return panel;
}
