export const loraKey=name=>name.replaceAll('\\','/');

export function normalizePromptParts(parts) {
  if(!Array.isArray(parts)||parts.length>10000)throw new Error('Некорректный промпт.');
  const result=[],seen=new Set();
  for(const part of parts){
    if(!part||typeof part!=='object')throw new Error('Некорректный элемент промпта.');
    if(part.type==='text'){
      if(typeof part.text!=='string')throw new Error('Некорректный текст промпта.');
      if(!part.text)continue;
      if(result.at(-1)?.type==='text')result.at(-1).text+=part.text;else result.push({type:'text',text:part.text});
    }else if(part.type==='lora'){
      const {name,strength}=part;
      if(typeof name!=='string'||!name||name==='None'||name.length>2000||/^[a-z]:|^[/\\]|[\x00-\x1f]/i.test(name)||loraKey(name).split('/').some(segment=>segment==='..'||segment==='.')||typeof strength!=='number'||!Number.isFinite(strength)||strength < -1||strength > 2)throw new Error('Некорректная LoRA или её вес (от −1 до 2).');
      const key=loraKey(name);if(seen.has(key))continue;seen.add(key);result.push({type:'lora',name,strength});
    }else throw new Error('Неизвестный элемент промпта.');
  }
  return result;
}

export function promptPartsFromSettings(settings) {
  if(settings.positiveParts!==undefined)return normalizePromptParts(settings.positiveParts);
  const loras=(settings.loras??[]).filter(lora=>lora.name&&lora.name!=='None');
  let text=settings.positive??'';
  if(typeof text!=='string')throw new Error('Промпт должен быть текстом.');
  const descriptions=loras.map(lora=>lora.description?.trim()).filter(Boolean);
  const parts=[{type:'text',text},...loras.map(lora=>({type:'lora',name:lora.name,strength:Number(lora.strength??1)}))];
  if(descriptions.length)parts.push({type:'text',text:(text.trim()?', ':'')+descriptions.join(', ')});
  return normalizePromptParts(parts);
}

export function resolvePromptParts(parts) {
  const normalized=normalizePromptParts(parts);
  return {text:normalized.filter(part=>part.type==='text').map(part=>part.text).join(''),loras:normalized.filter(part=>part.type==='lora').map(({name,strength})=>({name,strength}))};
}
