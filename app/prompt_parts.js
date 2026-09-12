import {randomUuid} from './config.js';
import {splitPromptTags} from './tag_input.js';
export const loraKey=name=>name.replaceAll('\\','/');
const contentTypes=new Set(['Character','Concept','Style','Pose','Clothing','Object','Background','Effect','Processing']);
const contentScopes=new Set(['global','subject']);
const contentIdPattern=/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9._-]*)+$/;

function contentStrings(value,label) {
  if(!Array.isArray(value)||value.length>10000||value.some(text=>typeof text!=='string'))throw new Error(`Некорректный ${label} контента.`);
  return [...value];
}

function contentBinding(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!['lora','control','reference','workflow'].includes(value.kind))throw new Error('Некорректная техническая реализация контента.');
  if(value.kind==='lora'){
    const strength=Number(value.strength??1),clipStrength=Number(value.clipStrength??strength);
    if(typeof value.name!=='string'||!value.name||value.name==='None'||value.name.length>2000||/^[a-z]:|^[/\\]|[\x00-\x1f]/i.test(value.name)||loraKey(value.name).split('/').some(segment=>segment==='..'||segment==='.')||!Number.isFinite(strength)||!Number.isFinite(clipStrength)||strength < -1||strength > 2||clipStrength < -1||clipStrength > 2)throw new Error('Некорректная backend LoRA контента.');
    return {kind:'lora',name:loraKey(value.name),strength,clipStrength};
  }
  if(typeof value.name!=='string'||!value.name.trim())throw new Error('Техническая реализация контента требует имя.');
  const parameters=value.parameters??{};
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw new Error('Некорректные параметры технической реализации.');
  return {kind:value.kind,name:value.name,parameters:structuredClone(parameters)};
}

export function contentPromptPart(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.type!=='content')throw new Error('Некорректный элемент контента в промпте.');
  if(typeof value.contentId!=='string'||!contentIdPattern.test(value.contentId)||/[/\\]/.test(value.contentId))throw new Error('Некорректный semantic ID контента.');
  if(!contentTypes.has(value.contentType)||!value.contentId.startsWith(`${value.contentType.toLowerCase()}:`))throw new Error('Некорректный тип контента.');
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>500)throw new Error('Контент требует отображаемое имя.');
  if(!contentScopes.has(value.scope))throw new Error('Некорректная область применения контента.');
  if(value.subjectId!==undefined&&(typeof value.subjectId!=='string'||!value.subjectId.trim()||value.subjectId.length>200))throw new Error('Некорректная цель контента.');
  const snapshot=value.snapshot;
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('Контент требует воспроизводимый снимок.');
  const parameters=snapshot.parameters??{};
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw new Error('Некорректные параметры контента.');
  const recipe=snapshot.recipe;
  if(recipe!==undefined&&(typeof recipe!=='string'||!recipe.trim()))throw new Error('Некорректный recipe снимка контента.');
  return {
    type:'content',contentId:value.contentId,contentType:value.contentType,name:value.name,scope:value.scope,
    ...(value.subjectId===undefined?{}:{subjectId:value.subjectId}),
    snapshot:{
      prompt:contentStrings(snapshot.prompt??[],'положительный prompt'),
      negative:contentStrings(snapshot.negative??[],'отрицательный prompt'),
      bindings:(snapshot.bindings??[]).map(contentBinding),
      parameters:structuredClone(parameters),
      ...(recipe===undefined?{}:{recipe}),
    },
  };
}

export function characterPromptPart(value,{instanceId=randomUuid(),framePrompt='',disabledTags=[]}={}) {
  if(typeof instanceId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(instanceId)||typeof framePrompt!=='string')throw new Error('Некорректный экземпляр персонажа.');
  if(!value||typeof value!=='object'||typeof value.name!=='string'||!value.name)throw new Error('Некорректный персонаж в промпте.');
  const character=structuredClone(value);
  character.lora??='None';character.strength=Number(character.strength??1);character.trigger??='';
  character.appearances??={'По умолчанию':character.appearance??''};
  character.outfits??={'По умолчанию':character.outfit??''};
  for(const field of ['appearances','outfits']){
    const map=character[field];
    if(!map||typeof map!=='object'||Array.isArray(map)||!Object.keys(map).length||Object.values(map).some(text=>typeof text!=='string'))throw new Error('Некорректные варианты персонажа.');
  }
  character.activeAppearanceName=Object.hasOwn(character.appearances,character.activeAppearanceName)?character.activeAppearanceName:Object.keys(character.appearances)[0];
  character.activeOutfitName=Object.hasOwn(character.outfits,character.activeOutfitName)?character.activeOutfitName:Object.keys(character.outfits)[0];
  character.appearance=character.appearances[character.activeAppearanceName];
  character.outfitEnabled=character.outfitEnabled!==false;
  if(typeof character.trigger!=='string')throw new Error('Некорректный триггер персонажа.');
  if(character.lora!=='None')normalizePromptParts([{type:'lora',name:character.lora,strength:character.strength}]);
  if(!Array.isArray(disabledTags)||disabledTags.length>10000||disabledTags.some(entry=>!entry||!['appearance','outfit'].includes(entry.kind)||typeof entry.variant!=='string'||typeof entry.tag!=='string'||!entry.tag.trim()))throw new Error('Некорректное состояние тегов персонажа.');
  const disabled=disabledTags.map(({kind,variant,tag})=>({kind,variant,tag}));
  return {type:'character',instanceId,character,framePrompt,disabledTags:disabled};
}

export function normalizePromptParts(parts) {
  if(!Array.isArray(parts)||parts.length>10000)throw new Error('Некорректный промпт.');
  const result=[],seen=new Set();
  const characterLoras=new Set(parts.filter(part=>part?.type==='character'&&typeof part.character?.lora==='string').map(part=>loraKey(part.character.lora)));
  for(const [index,part] of parts.entries()){
    if(!part||typeof part!=='object')throw new Error('Некорректный элемент промпта.');
    if(part.type==='text'){
      if(typeof part.text!=='string')throw new Error('Некорректный текст промпта.');
      if(!part.text)continue;
      if(result.at(-1)?.type==='text')result.at(-1).text+=part.text;else result.push({type:'text',text:part.text});
    }else if(part.type==='lora'){
      const {name,strength}=part;
      if(typeof name!=='string'||!name||name==='None'||name.length>2000||/^[a-z]:|^[/\\]|[\x00-\x1f]/i.test(name)||loraKey(name).split('/').some(segment=>segment==='..'||segment==='.')||typeof strength!=='number'||!Number.isFinite(strength)||strength < -1||strength > 2)throw new Error('Некорректная LoRA или её вес (от −1 до 2).');
      const key=loraKey(name);if(seen.has(key)||characterLoras.has(key))continue;seen.add(key);result.push({type:'lora',name,strength});
    }else if(part.type==='character'){
      const normalized=characterPromptPart(part.character,{instanceId:part.instanceId??`legacy-character-${index}`,framePrompt:part.framePrompt??'',disabledTags:part.disabledTags??[]}),key='character:'+normalized.instanceId;
      if(seen.has(key))throw new Error('Повторяющийся ID экземпляра персонажа.');seen.add(key);result.push(normalized);
    }else if(part.type==='content'){
      result.push(contentPromptPart(part));
    }else throw new Error('Неизвестный элемент промпта.');
  }
  return result;
}

export function promptPartsFromSettings(settings) {
  if(settings.positiveParts!==undefined){
    const parts=normalizePromptParts(settings.positiveParts);
    if(settings.promptVersion!==2&&!parts.some(part=>part.type==='character')&&settings.character){
      if(resolvePromptParts(parts).text.trim())parts.push({type:'text',text:', '});
      parts.push(characterPromptPart(settings.character));
    }
    return normalizePromptParts(parts);
  }
  const loras=(settings.loras??[]).filter(lora=>lora.name&&lora.name!=='None');
  let text=settings.positive??'';
  if(typeof text!=='string')throw new Error('Промпт должен быть текстом.');
  const descriptions=loras.map(lora=>lora.description?.trim()).filter(Boolean);
  const parts=[{type:'text',text},...loras.map(lora=>({type:'lora',name:lora.name,strength:Number(lora.strength??1)}))];
  if(descriptions.length)parts.push({type:'text',text:(text.trim()?', ':'')+descriptions.join(', ')});
  if(settings.character){if(resolvePromptParts(parts).text.trim())parts.push({type:'text',text:', '});parts.push(characterPromptPart(settings.character));}
  return normalizePromptParts(parts);
}

export function resolvePromptParts(parts) {
  const normalized=normalizePromptParts(parts);
  const loras=[],seen=new Map(),negative=[],content=[],workflowAugmentations=[];
  const add=lora=>{if(lora.name==='None')return;const key=loraKey(lora.name),strength=Number(lora.strength),clipStrength=Number(lora.clipStrength??strength),signature=`${strength}:${clipStrength}`;if(seen.has(key)){if(seen.get(key)!==signature)throw new Error(`У backend LoRA «${lora.name}» должен быть общий вес во всех элементах контента.`);return;}seen.set(key,signature);loras.push(lora.clipStrength===undefined?{name:lora.name,strength}:{name:lora.name,strength,clipStrength});};
  const text=normalized.map(part=>{
    if(part.type==='text')return part.text;
    if(part.type==='lora'){add({name:part.name,strength:part.strength});return '';}
    if(part.type==='content'){
      content.push(part);negative.push(...part.snapshot.negative);
      for(const binding of part.snapshot.bindings){if(binding.kind==='lora')add({name:binding.name,strength:binding.strength,clipStrength:binding.clipStrength});else workflowAugmentations.push({contentId:part.contentId,contentType:part.contentType,scope:part.scope,...binding});}
      return part.snapshot.prompt.filter(Boolean).join(', ');
    }
    const c=part.character;add({name:c.lora,strength:c.strength});
    const visible=(kind,variant,source)=>{const disabled=new Set(part.disabledTags.filter(entry=>entry.kind===kind&&entry.variant===variant).map(entry=>entry.tag));return disabled.size?splitPromptTags([source]).filter(tag=>!disabled.has(tag)).join(', '):source;};
    return [c.trigger,visible('appearance',c.activeAppearanceName,c.appearances[c.activeAppearanceName]),c.outfitEnabled?visible('outfit',c.activeOutfitName,c.outfits[c.activeOutfitName]):'',part.framePrompt].filter(text=>text.trim()).join(', ');
  }).join('');
  return {text,negative:negative.filter(Boolean).join(', '),loras,content,workflowAugmentations};
}
