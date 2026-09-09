import { normalizePromptParts, resolvePromptParts, loraKey, characterPromptPart } from './prompt_parts.js';
import {createCharacterToken,readCharacterToken,characterOptions} from './prompt_character.js';
import {categoryOf,promptCategoryIcon} from './lora_categories.js';
let mentionCatalog=()=>[];
let characterActions={};

export function createPromptEditor(textarea,{onChange=()=>{},getLoras=()=>[],onSaveVariant,onEditLibrary}={}) {
  const doc=textarea.ownerDocument,win=doc.defaultView;
  const root=doc.createElement('div');root.id='positive-prompt-editor';root.className='inline-prompt';
  root.setAttribute('contenteditable','true');root.setAttribute('role','textbox');root.setAttribute('aria-label','Описание изображения');root.setAttribute('aria-multiline','true');root.dataset.placeholder='Опишите изображение…';root.spellcheck=false;
  textarea.hidden=true;textarea.before(root);doc.querySelector('label[for="positive-prompt"]')?.setAttribute('for',root.id);
  let lastRange=null,lastText=textarea.value,undo=[],undoIndex=-1;
  let options=null;
  const closeOptions=()=>{options?.remove();options=null;};
  const outsideOptions=event=>{if(options&&!options.contains(event.target)&&!event.target.closest('.prompt-character-head'))closeOptions();};
  doc.addEventListener('pointerdown',outsideOptions);
  const characterToken=part=>createCharacterToken(part,{doc,onChange:()=>changed(),openOptions:el=>{
    closeOptions();options=characterOptions(el,{doc,onChange:()=>changed(),replace:(previous,next)=>{const node=characterToken(next);previous.replaceWith(node);return node;},onSaveVariant,onEditLibrary,close:closeOptions});
    doc.body.append(options);const rect=el.getBoundingClientRect();
    options.style.left=`${Math.max(8,Math.min(rect.left,win.innerWidth-336))}px`;options.style.top=`${Math.max(8,Math.min(rect.bottom+6,win.innerHeight-options.getBoundingClientRect().height-8))}px`;
    options.querySelector('select')?.focus();
  }});
  const mentions=doc.createElement('div');mentions.className='prompt-mentions';mentions.id='prompt-lora-mentions';mentions.setAttribute('role','listbox');mentions.setAttribute('aria-label','LoRA');mentions.hidden=true;doc.body.append(mentions);
  let mentionRange=null,choices=[],choiceIndex=0;
  const closeMentions=()=>{mentions.hidden=true;mentionRange=null;root.setAttribute('aria-expanded','false');root.removeAttribute('aria-activedescendant');};
  root.setAttribute('aria-controls',mentions.id);root.setAttribute('aria-autocomplete','list');root.setAttribute('aria-expanded','false');
  const highlightChoice=()=>{
    [...mentions.children].forEach((el,index)=>el.setAttribute('aria-selected',String(index===choiceIndex)));
    const active=mentions.children[choiceIndex];if(active){root.setAttribute('aria-activedescendant',active.id);active.scrollIntoView?.({block:'nearest'});}
  };
  const chooseMention=index=>{
    const item=choices[index];if(!item||!mentionRange)return;
    lastRange=mentionRange.cloneRange();closeMentions();insert([item.character?characterPromptPart(item.character):{type:'lora',name:item.name,strength:1}]);root.focus();
  };
  const updateMentions=()=>{
    const selection=win.getSelection(),node=selection?.anchorNode;
    if(!selection?.isCollapsed||node?.nodeType!==3||node.parentNode!==root){closeMentions();return;}
    const prefix=node.textContent.slice(0,selection.anchorOffset),match=prefix.match(/(?:^|[\s,(])@([^@\n,]*)$/);
    if(!match){closeMentions();return;}
    const query=match[1].toLocaleLowerCase(),parts=partsOf(root),used=new Set(resolvePromptParts(parts).loras.map(part=>loraKey(part.name)));
    choices=getLoras().filter(item=>(item.character?!parts.some(part=>part.type==='character'&&part.character.name===item.character.name):item.name!=='None'&&!used.has(loraKey(item.name)))&&item.title.toLocaleLowerCase().includes(query)).slice(0,30);choiceIndex=0;
    mentionRange=doc.createRange();mentionRange.setStart(node,prefix.length-query.length-1);mentionRange.setEnd(node,selection.anchorOffset);
    mentions.replaceChildren();
    for(const [index,item] of choices.entries()){
      const option=doc.createElement('div');option.id=`prompt-lora-option-${index}`;option.setAttribute('role','option');option.textContent=item.title;option.title=item.title;
      option.addEventListener('mousedown',event=>event.preventDefault());option.addEventListener('click',()=>chooseMention(index));mentions.append(option);
    }
    if(!choices.length){const empty=doc.createElement('div');empty.textContent='LoRA не найдены';empty.setAttribute('role','status');mentions.append(empty);}
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
    if(range&&root.contains(range.commonAncestorContainer))lastRange=range.cloneRange();
  };
  const rangeForInsert=()=>{
    if(lastRange&&root.contains(lastRange.commonAncestorContainer))return lastRange.cloneRange();
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
  const refreshLabels=()=>{
    for(const el of root.querySelectorAll('.prompt-lora')){
      const title=titleFor(el.dataset.name);el.querySelector('.prompt-lora-name').textContent=title;
      el.setAttribute('aria-label',`LoRA: ${title}, вес ${el.dataset.strength}`);
    }
  };
  const token=part=>{
    const el=doc.createElement('span');el.className='prompt-lora';el.setAttribute('contenteditable','false');el.tabIndex=0;el.dataset.name=part.name;el.dataset.strength=String(part.strength);
    const label=titleFor(part.name);
    el.title=part.name+' · Ctrl +/− или Ctrl+колёсико: вес · Backspace: удалить';el.setAttribute('aria-label',`LoRA: ${label}, вес ${part.strength}`);
    const name=doc.createElement('span');name.className='prompt-lora-name';name.textContent=label;
    const weight=doc.createElement('span');weight.className='prompt-lora-weight';weight.textContent=String(part.strength);
    el.onclick=()=>{el.focus();const range=doc.createRange();range.selectNode(el);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);remember();};
    el.append(promptCategoryIcon(doc,categoryOf(part)),name,weight);return el;
  };
  const fragment=parts=>{const result=doc.createDocumentFragment();for(const part of normalizePromptParts(parts))result.append(part.type==='text'?doc.createTextNode(part.text):part.type==='character'?characterToken(part):token(part));return result;};
  const write=(parts,{save=false,resetUndo=true}={})=>{
    closeMentions();closeOptions();
    root.replaceChildren(fragment(parts));lastRange=null;
    if(resetUndo){undo=[];undoIndex=-1;}changed(save,resetUndo);
  };
  const insert=parts=>{
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
    for(const part of partsOf(root).filter(part=>part.type==='character'))remaining.delete(loraKey(part.character.lora));
    for(const el of root.querySelectorAll('.prompt-lora')){
      const part=remaining.get(loraKey(el.dataset.name));
      if(!part){el.remove();continue;}
      el.dataset.strength=String(part.strength);el.querySelector('.prompt-lora-weight').textContent=String(part.strength);remaining.delete(loraKey(part.name));
    }
    if(remaining.size){const range=rangeForInsert(),nodes=fragment([...remaining.values()]),last=nodes.lastChild;range.insertNode(nodes);if(last){range.setStartAfter(last);range.collapse(true);lastRange=range.cloneRange();}}
    changed(false);
  };
  root.addEventListener('input',event=>{if(event.target===root){changed();updateMentions();}});
  root.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))updateMentions();});
  root.addEventListener('click',updateMentions);
  root.addEventListener('blur',closeMentions);
  root.addEventListener('beforeinput',event=>{
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
    const hovered=event.target.closest('.prompt-lora,.prompt-character-head');if(hovered)return hovered;
    const selection=win.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);
    return [...root.querySelectorAll('.prompt-lora')].find(el=>range.intersectsNode(el))??null;
  };
  const adjustLoraWeight=(el,increase)=>{
    const strength=Math.max(-1,Math.min(2,Number((Number(el.dataset.strength)+(increase?0.05:-0.05)).toFixed(2))));
    el.dataset.strength=String(strength);el.querySelector('.prompt-lora-weight').textContent=String(strength);refreshLabels();changed();
  };
  root.addEventListener('wheel',event=>{
    if(!event.ctrlKey||!event.deltaY)return;const target=weightTarget(event);if(!target)return;
    event.preventDefault();adjustLoraWeight(target,event.deltaY<0);
  },{passive:false});
  root.addEventListener('keydown',event=>{
    if(event.target.tagName==='INPUT')return;
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
    const selected=event.target.closest('.prompt-lora,.prompt-character-head');
    if(selected&&['Backspace','Delete'].includes(event.key)){event.preventDefault();(selected.closest('.prompt-character')??selected).remove();closeOptions();root.focus();changed();}
  });
  root.addEventListener('paste',event=>{
    if(event.target.closest('[data-character-field]')){event.preventDefault();const selection=win.getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();const text=doc.createTextNode(event.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);changed();}return;}
    event.preventDefault();remember();let parts;
    try{const encoded=event.clipboardData.getData('application/x-prism-prompt');if(encoded)parts=normalizePromptParts(JSON.parse(encoded));}catch{ /* Некорректные данные вставляются обычным текстом. */ }
    insert(parts??[{type:'text',text:event.clipboardData.getData('text/plain')}]);
    const normalized=partsOf(root);if(root.querySelectorAll('.prompt-lora').length!==normalized.filter(part=>part.type==='lora').length)write(normalized,{save:true});
  });
  const copy=event=>{
    const selection=win.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0);if(!root.contains(range.commonAncestorContainer))return;
    const parts=partsOf(range.cloneContents());event.preventDefault();event.clipboardData.setData('application/x-prism-prompt',JSON.stringify(parts));
    event.clipboardData.setData('text/plain',parts.map(part=>part.type==='text'?part.text:part.type==='character'?resolvePromptParts([part]).text:`<lora:${part.name}:${part.strength}>`).join(''));
    if(event.type==='cut'){range.deleteContents();changed();}
  };
  root.addEventListener('copy',copy);root.addEventListener('cut',copy);doc.addEventListener('selectionchange',remember);
  const fromTextarea=()=>read();textarea.addEventListener('input',fromTextarea);
  write([{type:'text',text:textarea.value}]);
  return {root,read,write,insert,syncLoras,transformTextAtCaret,refreshLabels,destroy:()=>{closeOptions();doc.removeEventListener('pointerdown',outsideOptions);doc.removeEventListener('selectionchange',remember);textarea.removeEventListener('input',fromTextarea);mentions.remove();root.remove();textarea.hidden=false;}};
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
export function setPromptLoraCatalog(provider) {mentionCatalog=provider;editor?.refreshLabels();}
export function setPromptCharacterActions(actions) {characterActions=actions;}
export function insertPromptCharacter(character) {
  const current=setupPromptEditor();if(!current)return;
  const part=characterPromptPart(character),parts=current.read();
  const index=parts.findIndex(item=>item.type==='character'&&item.character.name===character.name);
  if(index>=0){parts[index]=part;current.write(parts,{save:true});}
  else current.insert([part,{type:'text',text:' '}]);
}
