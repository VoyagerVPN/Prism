import { normalizePromptParts, resolvePromptParts, loraKey, characterPromptPart, contentPromptPart } from './prompt_parts.js';
import {createCharacterToken,readCharacterToken,characterOptions} from './prompt_character.js';
import {categoryOf,promptCategoryIcon} from './lora_categories.js';
import {selectCharacterVariant} from './character_variants.js';
import {createCharacterTagPanel} from './prompt_character_tags.js';
let mentionCatalog=()=>[];
let characterActions={};
const contentTypeLabels={Character:'Персонаж',Concept:'Концепт',Style:'Стиль',Pose:'Поза',Clothing:'Одежда',Object:'Объект',Background:'Окружение',Effect:'Эффект',Processing:'Обработка'};
const contentRemoveLabels={Character:'персонажа',Concept:'концепт',Style:'стиль',Pose:'позу',Clothing:'одежду',Object:'объект',Background:'окружение',Effect:'эффект',Processing:'обработку'};

export function createPromptEditor(textarea,{onChange=()=>{},getLoras=()=>[],onSaveVariant,onEditLibrary}={}) {
  const doc=textarea.ownerDocument,win=doc.defaultView;
  const root=doc.createElement('div');root.id='positive-prompt-editor';root.className='inline-prompt';
  root.setAttribute('contenteditable','true');root.setAttribute('role','textbox');root.setAttribute('aria-label','Описание изображения');root.setAttribute('aria-multiline','true');root.dataset.placeholder='Опишите изображение…';root.spellcheck=false;
  textarea.hidden=true;textarea.before(root);doc.querySelector('label[for="positive-prompt"]')?.setAttribute('for',root.id);
  let lastRange=null,lastText=textarea.value,undo=[],undoIndex=-1;
  let options=null,selectedControl=null;
  let tagsPanel=null,tagsDispose=null,tagsOwner=null,tagsSection=null,tagsTimer=0,tagsPinned=false;
  const closeTags=()=>{win.clearTimeout(tagsTimer);tagsDispose?.();tagsDispose=null;tagsPanel?.remove();tagsPanel=null;tagsOwner=null;tagsPinned=false;};
  const deferCloseTags=()=>{win.clearTimeout(tagsTimer);if(tagsPinned||tagsPanel?.contains(doc.activeElement))return;tagsTimer=win.setTimeout(closeTags,180);};
  const openTags=(el,section,pinned=false)=>{
    if(options)return;
    win.clearTimeout(tagsTimer);
    if(tagsOwner===el&&tagsSection===section&&tagsPanel){tagsPinned||=pinned;return;}
    if(tagsPanel?.contains(doc.activeElement)&&doc.activeElement.closest('.tagify__tag--editable'))return;
    closeTags();tagsOwner=el;tagsSection=section;tagsPinned=pinned;
    const tags=createCharacterTagPanel(el,{doc,section,onChange:()=>changed()});tagsPanel=tags.element;tagsDispose=tags.destroy;doc.body.append(tagsPanel);
    const anchor=el.querySelector(section?`[data-character-variant="${section}"]`:'.prompt-character-summary'),rect=anchor.getBoundingClientRect(),size=tagsPanel.getBoundingClientRect();
    tagsPanel.style.left=`${Math.max(8,Math.min(rect.left,win.innerWidth-size.width-8))}px`;
    tagsPanel.style.top=`${Math.max(8,Math.min(rect.bottom+3,win.innerHeight-size.height-8))}px`;
    tagsPanel.onpointerenter=()=>win.clearTimeout(tagsTimer);tagsPanel.onpointerleave=deferCloseTags;
    tagsPanel.onfocusout=event=>{if(!tagsPanel?.contains(event.relatedTarget))deferCloseTags();};
    tagsPanel.onkeydown=event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();closeTags();}
      if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();root.dispatchEvent(new win.KeyboardEvent('keydown',{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,bubbles:true,cancelable:true}));}
    };
  };
  const closeOptions=()=>{options?.remove();options=null;};
  const clearControl=()=>{selectedControl=null;for(const el of root.querySelectorAll('.prompt-character')){el.classList.remove('is-selected');for(const control of el.querySelectorAll('[aria-pressed]'))control.setAttribute('aria-pressed','false');}};
  const outsideOptions=event=>{if(!options?.contains(event.target)&&!tagsPanel?.contains(event.target)&&!event.target.closest('.prompt-character-summary')){closeOptions();closeTags();clearControl();}};
  doc.addEventListener('pointerdown',outsideOptions);
  const selectControl=(el,kind)=>{
    clearControl();selectedControl={id:el.dataset.instanceId,kind};el.classList.add('is-selected');
    const control=el.querySelector(kind==='character'?'.prompt-character-head':`[data-character-variant="${kind}"]`);control.setAttribute('aria-pressed','true');control.focus();
    const range=doc.createRange();range.setStartAfter(el);range.collapse(true);
    const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();
  };
  const replaceCharacter=(previous,next)=>{
    const reopen=tagsOwner===previous,section=tagsSection,pinned=tagsPinned;if(reopen)closeTags();
    const node=characterToken(next);previous.replaceWith(node);if(selectedControl?.id===next.instanceId)selectControl(node,selectedControl.kind);if(reopen)openTags(node,section,pinned);return node;
  };
  const openCharacterOptions=(el,section)=>{
    closeTags();closeOptions();options=characterOptions(el,{doc,section,onChange:()=>changed(),replace:replaceCharacter,onSaveVariant,onEditLibrary,onShowTags:(el,section)=>openTags(el,section,true),close:closeOptions});
    doc.body.append(options);const rect=el.getBoundingClientRect();
    options.style.left=`${Math.max(8,Math.min(rect.left,win.innerWidth-336))}px`;options.style.top=`${Math.max(8,Math.min(rect.bottom+6,win.innerHeight-options.getBoundingClientRect().height-8))}px`;
    options.querySelector('select')?.focus();
  };
  const characterToken=part=>createCharacterToken(part,{doc,onChange:()=>changed(),onHover:openTags,onHoverEnd:deferCloseTags,openOptions:openCharacterOptions,onSelect:(el,kind)=>{
    const again=selectedControl?.id===el.dataset.instanceId&&selectedControl.kind===kind;
    closeOptions();selectControl(el,kind);if(again)openCharacterOptions(el,kind==='character'?undefined:kind);
  }});
  const mentions=doc.createElement('div');mentions.className='prompt-mentions';mentions.id='prompt-lora-mentions';mentions.setAttribute('role','listbox');mentions.setAttribute('aria-label','Контент');mentions.hidden=true;doc.body.append(mentions);
  let mentionRange=null,choices=[],choiceIndex=0;
  const closeMentions=()=>{mentions.hidden=true;mentionRange=null;root.setAttribute('aria-expanded','false');root.removeAttribute('aria-activedescendant');};
  root.setAttribute('aria-controls',mentions.id);root.setAttribute('aria-autocomplete','list');root.setAttribute('aria-expanded','false');
  const highlightChoice=()=>{
    [...mentions.children].forEach((el,index)=>el.setAttribute('aria-selected',String(index===choiceIndex)));
    const active=mentions.children[choiceIndex];if(active){root.setAttribute('aria-activedescendant',active.id);active.scrollIntoView?.({block:'nearest'});}
  };
  const chooseMention=index=>{
    const item=choices[index];if(!item||!mentionRange)return;
    lastRange=mentionRange.cloneRange();closeMentions();insert([item.character?characterPromptPart(item.character):item.content?contentPromptPart(item.content):{type:'lora',name:item.name,strength:1}]);root.focus();
  };
  const updateMentions=()=>{
    const selection=win.getSelection(),node=selection?.anchorNode;
    if(!selection?.isCollapsed||node?.nodeType!==3||node.parentNode!==root){closeMentions();return;}
    const prefix=node.textContent.slice(0,selection.anchorOffset),match=prefix.match(/(?:^|[\s,(])@([^@\n,]*)$/);
    if(!match){closeMentions();return;}
    const query=match[1].toLocaleLowerCase(),parts=partsOf(root),used=new Set(resolvePromptParts(parts).loras.map(part=>loraKey(part.name))),usedContent=new Set(parts.filter(part=>part.type==='content').map(part=>part.contentId));
    choices=getLoras().filter(item=>item.mention!==false&&(item.character?true:item.content?!usedContent.has(item.content.contentId):item.name!=='None'&&!used.has(loraKey(item.name)))&&item.title.toLocaleLowerCase().includes(query)).slice(0,30);choiceIndex=0;
    mentionRange=doc.createRange();mentionRange.setStart(node,prefix.length-query.length-1);mentionRange.setEnd(node,selection.anchorOffset);
    mentions.replaceChildren();
    for(const [index,item] of choices.entries()){
      const option=doc.createElement('div');option.id=`prompt-lora-option-${index}`;option.setAttribute('role','option');option.textContent=item.title;option.title=item.title;
      option.addEventListener('mousedown',event=>event.preventDefault());option.addEventListener('click',()=>chooseMention(index));mentions.append(option);
    }
    if(!choices.length){const empty=doc.createElement('div');empty.textContent='Контент не найден';empty.setAttribute('role','status');mentions.append(empty);}
    const rect=root.getBoundingClientRect(),below=win.innerHeight-rect.bottom-8,above=rect.top-8,height=Math.min(260,Math.max(below,above));
    mentions.style.left=`${rect.left}px`;mentions.style.width=`${rect.width}px`;mentions.style.maxHeight=`${Math.max(80,height)}px`;
    mentions.style.top=below>=Math.min(180,above)?`${rect.bottom+4}px`:'auto';mentions.style.bottom=mentions.style.top==='auto'?`${win.innerHeight-rect.top+4}px`:'auto';
    mentions.hidden=false;root.setAttribute('aria-expanded','true');if(choices.length)highlightChoice();
  };
  const partsOf=parent=>{
    const parts=[];
    const visit=node=>{
      if(node.nodeType===3){parts.push({type:'text',text:node.textContent});return;}
      if(node.nodeType!==1&&node.nodeType!==11)return;
      if(node.nodeType===1&&node.matches('.prompt-character')){parts.push(node.querySelector('.prompt-character-head')&&node.querySelector('[data-character-field="appearance"]')?readCharacterToken(node):{type:'text',text:node.textContent});return;}
      if(node.nodeType===1&&node.matches('.prompt-content')){try{const part=contentPromptPart(JSON.parse(node.dataset.content));const strength=Number(node.dataset.strength);if(Number.isFinite(strength)){for(const binding of part.snapshot.bindings)if(binding.kind==='lora'){binding.strength=strength;binding.clipStrength=strength;}part.snapshot.parameters.intensity=strength;}parts.push(part);}catch{parts.push({type:'text',text:node.textContent});}return;}
      if(node.nodeType===1&&node.matches('.prompt-lora')){parts.push({type:'lora',name:node.dataset.name,strength:Number(node.dataset.strength)});return;}
      if(node.nodeName==='BR'){parts.push({type:'text',text:'\n'});return;}
      if(['DIV','P'].includes(node.nodeName)&&parts.length&&parts.at(-1)?.text?.at(-1)!=='\n')parts.push({type:'text',text:'\n'});
      for(const child of node.childNodes)visit(child);
    };
    for(const child of parent.childNodes)visit(child);
    return normalizePromptParts(parts);
  };
  const remember=()=>{
    const selection=win.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
    for(const el of root.querySelectorAll('.prompt-lora'))el.classList.toggle('is-selected',Boolean(range&&!selection.isCollapsed&&range.intersectsNode(el)));
    for(const el of root.querySelectorAll('.prompt-character'))el.classList.toggle('is-selected',selectedControl?.id===el.dataset.instanceId||Boolean(range&&!selection.isCollapsed&&range.intersectsNode(el.querySelector('.prompt-character-summary'))));
    if(range&&root.contains(range.commonAncestorContainer))lastRange=range.cloneRange();
  };
  const rangeForInsert=()=>{
    if(lastRange&&root.contains(lastRange.commonAncestorContainer)){
      const range=lastRange.cloneRange(),node=range.commonAncestorContainer,character=(node.nodeType===1?node:node.parentElement)?.closest('.prompt-character');
      if(character){range.setStartAfter(character);range.collapse(true);}return range;
    }
    const range=doc.createRange();range.selectNodeContents(root);range.collapse(false);return range;
  };
  const record=parts=>{
    if(JSON.stringify(undo[undoIndex])===JSON.stringify(parts))return;
    undo=undo.slice(0,undoIndex+1);undo.push(structuredClone(parts));if(undo.length>100)undo.shift();undoIndex=undo.length-1;
  };
  const changed=(save=true,keepUndo=true)=>{
    const parts=partsOf(root);lastText=resolvePromptParts(parts).text;textarea.value=lastText;
    root.classList.toggle('is-empty',parts.length===0);
    if(keepUndo)record(parts);onChange(parts,{save});return parts;
  };
  const titleFor=name=>getLoras().find(item=>loraKey(item.name)===loraKey(name))?.title||loraKey(name).split('/').at(-1).replace(/\.safetensors$/i,'');
  const categoryFor=name=>categoryOf(getLoras().find(item=>loraKey(item.name)===loraKey(name))||{name});
  const refreshLabels=()=>{
    for(const el of root.querySelectorAll('.prompt-lora')){
      const title=titleFor(el.dataset.name);el.querySelector('.prompt-lora-name').textContent=title;
      el.setAttribute('aria-label',`Контент: ${title}, интенсивность ${el.dataset.strength}`);
      el.querySelector('.prompt-category-icon').replaceWith(promptCategoryIcon(doc,categoryFor(el.dataset.name)));
    }
    for(const el of root.querySelectorAll('.prompt-content')){
      const part=contentPromptPart(JSON.parse(el.dataset.content)),entry=getLoras().find(item=>item.content?.contentId===part.contentId),label=entry?.title||part.name,type=contentTypeLabels[part.contentType]||part.contentType;
      el.querySelector('.prompt-content-name').textContent=label;el.setAttribute('aria-label',`${type}: ${label}${el.dataset.strength?' · интенсивность '+el.dataset.strength:''}`);
    }
  };
  const token=part=>{
    const el=doc.createElement('span');el.className='prompt-lora';el.setAttribute('contenteditable','false');el.tabIndex=0;el.dataset.name=part.name;el.dataset.strength=String(part.strength);
    const label=titleFor(part.name);
    el.title=`${label} · Ctrl +/− или Ctrl+колёсико: интенсивность · Backspace: убрать`;el.setAttribute('aria-label',`Контент: ${label}, интенсивность ${part.strength}`);
    const name=doc.createElement('span');name.className='prompt-lora-name';name.textContent=label;
    const weight=doc.createElement('span');weight.className='prompt-lora-weight';weight.textContent=String(part.strength);
    const remove=doc.createElement('button');remove.type='button';remove.className='prompt-lora-remove';remove.title='Убрать контент';remove.setAttribute('aria-label',`Убрать контент: ${label}`);remove.textContent='×';
    remove.onclick=event=>{event.preventDefault();event.stopPropagation();el.remove();changed();root.focus();};
    el.onclick=()=>{el.focus();const range=doc.createRange();range.selectNode(el);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);remember();};
    el.append(promptCategoryIcon(doc,categoryFor(part.name)),name,weight,remove);return el;
  };
  const contentToken=value=>{
    const part=contentPromptPart(value),el=doc.createElement('span'),type=contentTypeLabels[part.contentType]||part.contentType,backend=part.snapshot.bindings.find(binding=>binding.kind==='lora'),strength=backend?.strength??part.snapshot.parameters.intensity;
    el.className='prompt-content';el.setAttribute('contenteditable','false');el.tabIndex=0;el.dataset.contentId=part.contentId;el.dataset.contentType=part.contentType;el.dataset.content=JSON.stringify(part);if(Number.isFinite(strength))el.dataset.strength=String(strength);
    el.title=`${type} · ${Number.isFinite(strength)?'Ctrl +/− или Ctrl+колёсико: интенсивность · ':''}Backspace: убрать`;el.setAttribute('aria-label',`${type}: ${part.name}${Number.isFinite(strength)?' · интенсивность '+strength:''}`);
    const name=doc.createElement('span');name.className='prompt-content-name';name.textContent=part.name;el.append(promptCategoryIcon(doc,part.contentType),name);
    if(part.scope==='subject'){
      const target=doc.createElement('span');target.className='prompt-content-target';target.textContent=`→ ${part.snapshot.parameters.subjectName||'персонаж'}`;target.title='Назначено персонажу';el.append(target);
    }
    if(Number.isFinite(strength)){const weight=doc.createElement('span');weight.className='prompt-lora-weight';weight.textContent=String(strength);el.append(weight);}
    const remove=doc.createElement('button');remove.type='button';remove.className='prompt-content-remove prompt-lora-remove';remove.title=`Убрать ${contentRemoveLabels[part.contentType]||'контент'}`;remove.setAttribute('aria-label',`${remove.title}: ${part.name}`);remove.textContent='×';
    remove.onclick=event=>{event.preventDefault();event.stopPropagation();el.remove();changed();root.focus();};
    el.onclick=()=>{el.focus();const range=doc.createRange();range.selectNode(el);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);remember();};
    el.append(remove);return el;
  };
  const fragment=parts=>{const result=doc.createDocumentFragment();for(const part of normalizePromptParts(parts))result.append(part.type==='text'?doc.createTextNode(part.text):part.type==='character'?characterToken(part):part.type==='content'?contentToken(part):token(part));return result;};
  const write=(parts,{save=false,resetUndo=true}={})=>{
    closeMentions();closeOptions();closeTags();clearControl();
    root.replaceChildren(fragment(parts));lastRange=null;
    if(resetUndo){undo=[];undoIndex=-1;}changed(save,resetUndo);
  };
  const insert=parts=>{
    const existing=partsOf(root),usedIds=new Set(existing.filter(part=>part.type==='character').map(part=>part.instanceId));
    parts=parts.map(part=>part.type==='character'&&usedIds.has(part.instanceId)?characterPromptPart(part.character,{framePrompt:part.framePrompt,disabledTags:part.disabledTags}):part);
    const weights=new Map(resolvePromptParts(existing).loras.map(lora=>[loraKey(lora.name),lora.strength]));
    parts=parts.map(part=>{if(part.type!=='character')return part;const key=loraKey(part.character.lora),copy=structuredClone(part);if(weights.has(key))copy.character.strength=weights.get(key);else weights.set(key,copy.character.strength);return copy;});
    for(const part of parts.filter(part=>part.type==='character'))for(const el of root.querySelectorAll('.prompt-lora'))if(loraKey(el.dataset.name)===loraKey(part.character.lora))el.remove();
    const range=rangeForInsert(),nodes=fragment(parts),last=nodes.lastChild;range.deleteContents();range.insertNode(nodes);
    if(last){range.setStartAfter(last);range.collapse(true);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();}
    changed();
  };
  const read=()=>{
    // Старые обработчики могут ещё присваивать value скрытому textarea.
    if(textarea.value!==lastText)write([{type:'text',text:textarea.value},...partsOf(root).filter(part=>part.type!=='text')]);
    return partsOf(root);
  };
  const transformTextAtCaret=transform=>{
    const selection=win.getSelection(),node=selection?.anchorNode;
    if(node?.nodeType!==3||(node.parentNode!==root&&!node.parentElement?.closest('[data-character-field]')))return;
    const result=transform(node.textContent,selection.anchorOffset);
    node.textContent=result.text;
    const range=doc.createRange();range.setStart(node,Math.min(result.position,node.length));range.collapse(true);
    selection.removeAllRanges();selection.addRange(range);remember();changed();
  };
  const syncLoras=loras=>{
    read();const wanted=normalizePromptParts(loras.filter(lora=>lora.name&&lora.name!=='None').map(lora=>({type:'lora',name:lora.name,strength:Number(lora.strength??1)}))),remaining=new Map(wanted.map(part=>[loraKey(part.name),part]));
    for(const part of partsOf(root).filter(part=>part.type==='character'||part.type==='content'))for(const lora of resolvePromptParts([part]).loras)remaining.delete(loraKey(lora.name));
    for(const el of root.querySelectorAll('.prompt-lora')){
      const part=remaining.get(loraKey(el.dataset.name));
      if(!part){el.remove();continue;}
      el.dataset.strength=String(part.strength);el.querySelector('.prompt-lora-weight').textContent=String(part.strength);remaining.delete(loraKey(part.name));
    }
    if(remaining.size){const range=rangeForInsert(),nodes=fragment([...remaining.values()]),last=nodes.lastChild;range.insertNode(nodes);if(last){range.setStartAfter(last);range.collapse(true);lastRange=range.cloneRange();}}
    changed(false);
  };
  const mergeCharacterTemplate=(current,previous,next)=>{
    if(!previous)return structuredClone(next);
    const merged=structuredClone(next);
    const mergeVariants=field=>{
      const result={...merged[field]};
      for(const [name,value] of Object.entries(current[field]??{}))if(!Object.hasOwn(previous[field]??{},name)||previous[field][name]!==value)result[name]=value;
      merged[field]=result;
    };
    mergeVariants('appearances');mergeVariants('outfits');
    for(const field of ['trigger','strength','activeAppearanceName','activeOutfitName','outfitEnabled'])if(current[field]!==previous[field])merged[field]=current[field];
    merged.name=next.name;
    return merged;
  };
  const syncCharacter=(previousName,character,previousTemplate=null)=>{
    read();let updated=0;
    for(const el of [...root.querySelectorAll('.prompt-character')]){
      const part=readCharacterToken(el);if(part.character.name!==previousName)continue;
      const merged=mergeCharacterTemplate(part.character,previousTemplate,character);
      const next=characterPromptPart(merged,{instanceId:part.instanceId,framePrompt:part.framePrompt,disabledTags:part.disabledTags});
      replaceCharacter(el,next);updated++;
    }
    if(updated)changed(false);
    return updated;
  };
  root.addEventListener('input',event=>{if(event.target===root){changed();updateMentions();}});
  root.addEventListener('focusin',event=>{if(event.target.closest('[data-character-field]'))clearControl();});
  root.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))updateMentions();});
  root.addEventListener('click',updateMentions);
  root.addEventListener('blur',closeMentions);
  root.addEventListener('beforeinput',event=>{
    if(tagsPanel?.contains(event.target))return;
    if(event.target.closest('[data-character-field]'))return;
    if(event.inputType==='insertParagraph'||event.inputType==='insertLineBreak'){event.preventDefault();remember();insert([{type:'text',text:'\n'}]);return;}
    if(!['deleteContentBackward','deleteContentForward'].includes(event.inputType))return;
    const selection=win.getSelection();if(!selection?.isCollapsed||!selection.rangeCount)return;
    const node=selection.anchorNode,offset=selection.anchorOffset,backward=event.inputType==='deleteContentBackward';
    if(node?.nodeType!==3||node.parentNode!==root||(backward?offset===0:offset===node.length))return;
    // Не отдаём удаление текста Chromium: рядом с contenteditable=false он добавляет служебные BR.
    const segments=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(node.textContent)];
    const start=backward?(segments.filter(part=>part.index<offset).at(-1)?.index??0):offset;
    const end=backward?offset:(segments.find(part=>part.index>offset)?.index??node.length);
    const range=doc.createRange();range.setStart(node,start);range.setEnd(node,end);event.preventDefault();range.deleteContents();range.collapse(true);
    selection.removeAllRanges();selection.addRange(range);remember();changed();updateMentions();
  });
  const weightTarget=event=>{
    const hovered=event.target.closest('.prompt-lora,.prompt-content,.prompt-character-head');if(hovered)return hovered;
    if(selectedControl?.kind==='character')return [...root.querySelectorAll('.prompt-character')].find(el=>el.dataset.instanceId===selectedControl.id)?.querySelector('.prompt-character-head')??null;
    const selection=win.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);
    return [...root.querySelectorAll('.prompt-lora,.prompt-content')].find(el=>range.intersectsNode(el))??null;
  };
  const adjustLoraWeight=(el,increase)=>{
    const strength=Math.max(-1,Math.min(2,Number((Number(el.dataset.strength)+(increase?0.05:-0.05)).toFixed(2))));
    el.dataset.strength=String(strength);el.querySelector('.prompt-lora-weight').textContent=String(strength);
    if(el.matches('.prompt-content')){const part=contentPromptPart(JSON.parse(el.dataset.content));for(const binding of part.snapshot.bindings)if(binding.kind==='lora'){binding.strength=strength;binding.clipStrength=strength;}part.snapshot.parameters.intensity=strength;el.dataset.content=JSON.stringify(part);}
    const owner=el.closest('.prompt-character');
    if(owner){const lora=JSON.parse(owner.dataset.character).lora;if(lora!=='None')for(const other of root.querySelectorAll('.prompt-character'))if(loraKey(JSON.parse(other.dataset.character).lora)===loraKey(lora)){const head=other.querySelector('.prompt-character-head');head.dataset.strength=String(strength);head.querySelector('.prompt-lora-weight').textContent=String(strength);}}
    refreshLabels();changed();
  };
  root.addEventListener('wheel',event=>{
    if(!event.deltaY)return;
    const variant=event.target.closest('[data-character-variant]'),owner=event.target.closest('.prompt-character');
    const selected=owner&&selectedControl?.id===owner.dataset.instanceId&&selectedControl.kind===(variant?.dataset.characterVariant??'character')&&event.target.closest('.prompt-character-summary');
    if(!event.ctrlKey&&!selected)return;
    if(variant){
      event.preventDefault();closeOptions();const part=readCharacterToken(owner),c=part.character,kind=variant.dataset.characterVariant;
      const keys=Object.keys(kind==='appearance'?c.appearances:c.outfits);if(kind==='outfit')keys.push(null);
      const current=kind==='outfit'&&!c.outfitEnabled?null:c[kind==='appearance'?'activeAppearanceName':'activeOutfitName'];
      const next=keys[(keys.indexOf(current)+(event.deltaY>0?1:-1)+keys.length)%keys.length];
      if(next===null)c.outfitEnabled=false;else{selectCharacterVariant(c,kind,next);if(kind==='outfit')c.outfitEnabled=true;}
      replaceCharacter(owner,part);changed();return;
    }
    const target=weightTarget(event);if(!target)return;event.preventDefault();adjustLoraWeight(target,event.deltaY<0);
  },{passive:false});
  root.addEventListener('keydown',event=>{
    if(event.target.tagName==='INPUT')return;
    if(event.key==='Escape'){clearControl();closeOptions();closeTags();}
    if(event.target===root&&selectedControl&&['Enter',' '].includes(event.key)){
      const owner=[...root.querySelectorAll('.prompt-character')].find(el=>el.dataset.instanceId===selectedControl.id);
      if(owner){event.preventDefault();openCharacterOptions(owner,selectedControl.kind==='character'?undefined:selectedControl.kind);return;}
    }
    if(event.ctrlKey&&['+','=','-','_','ArrowUp','ArrowDown'].includes(event.key)){
      const target=weightTarget(event);if(target){event.preventDefault();adjustLoraWeight(target,['+','=','ArrowUp'].includes(event.key));return;}
    }
    if(!mentions.hidden){
      if(event.key==='Escape'){event.preventDefault();closeMentions();return;}
      if(choices.length&&!event.ctrlKey&&!event.metaKey&&['ArrowDown','ArrowUp','Enter','Tab'].includes(event.key)){
        event.preventDefault();if(event.key==='Enter'||event.key==='Tab')chooseMention(choiceIndex);
        else{choiceIndex=(choiceIndex+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;highlightChoice();}return;
      }
    }
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){
      event.preventDefault();const next=undoIndex+(event.key.toLowerCase()==='y'||event.shiftKey?1:-1);
      if(next>=0&&next<undo.length){undoIndex=next;write(undo[next],{save:true,resetUndo:false});}return;
    }
    const selected=event.target.closest('.prompt-lora,.prompt-content,.prompt-character-head')??(selectedControl?.kind==='character'?weightTarget(event):null);
    if(selected&&['Backspace','Delete'].includes(event.key)){event.preventDefault();(selected.closest('.prompt-character')??selected).remove();clearControl();closeOptions();closeTags();root.focus();changed();}
  });
  root.addEventListener('paste',event=>{
    if(tagsPanel?.contains(event.target))return;
    if(event.target.closest('[data-character-field]')){event.preventDefault();const selection=win.getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();const text=doc.createTextNode(event.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);changed();}return;}
    event.preventDefault();remember();let parts;
    try{const encoded=event.clipboardData.getData('application/x-prism-prompt');if(encoded)parts=normalizePromptParts(JSON.parse(encoded));}catch{ /* Некорректные данные вставляются обычным текстом. */ }
    insert(parts??[{type:'text',text:event.clipboardData.getData('text/plain')}]);
    const normalized=partsOf(root);if(root.querySelectorAll('.prompt-lora').length!==normalized.filter(part=>part.type==='lora').length)write(normalized,{save:true});
  });
  const copy=event=>{
    if(tagsPanel?.contains(event.target))return;
    const selection=win.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
    const card=(!range||selection.isCollapsed)&&selectedControl?.kind==='character'?[...root.querySelectorAll('.prompt-character')].find(el=>el.dataset.instanceId===selectedControl.id):null;
    if(!card&&(!range||selection.isCollapsed||!root.contains(range.commonAncestorContainer)))return;
    const parts=card?[readCharacterToken(card)]:partsOf(range.cloneContents());event.preventDefault();event.clipboardData.setData('application/x-prism-prompt',JSON.stringify(parts));
    event.clipboardData.setData('text/plain',parts.map(part=>part.type==='text'?part.text:['character','content'].includes(part.type)?resolvePromptParts([part]).text:`<lora:${part.name}:${part.strength}>`).join(''));
    if(event.type==='cut'){if(card){card.remove();clearControl();}else range.deleteContents();changed();}
  };
  root.addEventListener('copy',copy);root.addEventListener('cut',copy);doc.addEventListener('selectionchange',remember);
  const fromTextarea=()=>read();textarea.addEventListener('input',fromTextarea);
  write([{type:'text',text:textarea.value}]);
  const subjects=()=>partsOf(root).filter(part=>part.type==='character').map(part=>({id:part.instanceId,name:part.character.name}));
  const contentSelections=()=>partsOf(root).filter(part=>part.type==='content').map(part=>({contentId:part.contentId,scope:part.scope,subjectId:part.subjectId}));
  return {root,read,write,insert,syncLoras,syncCharacter,subjects,contentSelections,transformTextAtCaret,refreshLabels,destroy:()=>{closeOptions();closeTags();doc.removeEventListener('pointerdown',outsideOptions);doc.removeEventListener('selectionchange',remember);textarea.removeEventListener('input',fromTextarea);mentions.remove();root.remove();textarea.hidden=false;}};
}

let editor;
export function setupPromptEditor() {
  if(editor?.root.isConnected)return editor;
  const textarea=document.getElementById('positive-prompt');if(!textarea)return null;
  editor=createPromptEditor(textarea,{getLoras:()=>mentionCatalog(),onSaveVariant:(...args)=>characterActions.saveVariant?.(...args),onEditLibrary:character=>characterActions.edit?.(character),onChange:(parts,{save})=>{
    window.dispatchEvent(new CustomEvent('prompt-loras-changed',{detail:resolvePromptParts(parts).loras}));
    if(save)window.dispatchEvent(new Event('save-settings'));
  }});return editor;
}
export const readPositiveParts=()=>editor?.root.isConnected?editor.read():null;
export const writePositiveParts=parts=>setupPromptEditor()?.write(parts);
export const syncPromptLoras=loras=>setupPromptEditor()?.syncLoras(loras);
export const syncPromptCharacter=(previousName,character,previousTemplate)=>setupPromptEditor()?.syncCharacter(previousName,character,previousTemplate);
export const promptContentSubjects=()=>setupPromptEditor()?.subjects()??[];
export const promptContentSelections=()=>setupPromptEditor()?.contentSelections()??[];
export function setPromptContentCatalog(provider) {mentionCatalog=provider;editor?.refreshLabels();}
export const setPromptLoraCatalog=setPromptContentCatalog;
export function setPromptCharacterActions(actions) {characterActions=actions;}
export function insertPromptContent(content) {
  const current=setupPromptEditor();if(!current)return;
  current.insert([contentPromptPart(content),{type:'text',text:' '}]);
}
export function insertPromptCharacter(character) {
  const current=setupPromptEditor();if(!current)return;
  current.insert([characterPromptPart(character),{type:'text',text:' '}]);
}
