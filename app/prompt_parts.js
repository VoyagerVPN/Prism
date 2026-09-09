export const loraKey=name=>name.replaceAll('\\','/');

export function characterPromptPart(value) {
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
  return {type:'character',character};
}

export function normalizePromptParts(parts) {
  if(!Array.isArray(parts)||parts.length>10000)throw new Error('Некорректный промпт.');
  const result=[],seen=new Set();
  const characterLoras=new Set(parts.filter(part=>part?.type==='character'&&typeof part.character?.lora==='string').map(part=>loraKey(part.character.lora)));
  for(const part of parts){
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
      const normalized=characterPromptPart(part.character),key='character:'+normalized.character.name;
      if(seen.has(key))continue;seen.add(key);result.push(normalized);
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
  const loras=[],seen=new Set();
  const add=lora=>{if(lora.name==='None'||seen.has(loraKey(lora.name)))return;seen.add(loraKey(lora.name));loras.push(lora);};
  const text=normalized.map(part=>{
    if(part.type==='text')return part.text;
    if(part.type==='lora'){add({name:part.name,strength:part.strength});return '';}
    const c=part.character;add({name:c.lora,strength:c.strength});
    return [c.trigger,c.appearances[c.activeAppearanceName],c.outfitEnabled?c.outfits[c.activeOutfitName]:''].filter(text=>text.trim()).join(', ');
  }).join('');
  return {text,loras};
}
