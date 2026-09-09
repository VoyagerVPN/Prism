export const MAX_PRISM_BYTES = 2 * 1024 * 1024;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const normalize=value=>value.replaceAll('\\','/');

function string(value, field, max=100000) {
  if(typeof value!=='string'||value.length>max)throw new Error(`Некорректное поле «${field}».`);
  return value;
}

function name(value, field) {
  const result=string(value,field,200).trim();
  if(!result||['none','__proto__','constructor','prototype'].includes(result))throw new Error(`Некорректное поле «${field}».`);
  return result;
}

function characterData(value) {
  if(!record(value))throw new Error('В файле нет персонажа.');
  const variants={};
  if(value.trigger!==undefined)variants.trigger=string(value.trigger,'Триггерворд');
  if(value.appearances!==undefined) {
    const appearances=value.appearances;
    if(!record(appearances)||!Object.keys(appearances).length||Object.keys(appearances).length>1000)throw new Error('Некорректный список внешности.');
    for(const [key,text] of Object.entries(appearances)){if(name(key,'Вариант внешности')!==key)throw new Error('Пробелы по краям имени варианта.');string(text,'Внешность');}
    const active=value.activeAppearanceName??Object.keys(appearances)[0];
    if(typeof active!=='string'||!Object.hasOwn(appearances,active))throw new Error('Выбранная внешность отсутствует.');
    variants.appearances={...appearances};variants.activeAppearanceName=active;
  } else if(value.activeAppearanceName!==undefined)throw new Error('Нет списка вариантов внешности.');
  const lora=string(value.lora??'None','LoRA',2000);
  if(lora!=='None'&&(!lora||/^([a-z]:|\/)/i.test(normalize(lora))||normalize(lora).split('/').some(part=>part==='..'||part==='.')||/[\x00-\x1f]/.test(lora)))throw new Error('В карточке ожидается относительное имя LoRA.');
  const strength=value.strength??1;
  if(typeof strength!=='number'||!Number.isFinite(strength)||strength < -1||strength > 2)throw new Error('Вес LoRA должен быть от −1 до 2.');
  const outfits=value.outfits??{'По умолчанию':value.outfit??''};
  if(!record(outfits)||!Object.keys(outfits).length||Object.keys(outfits).length>1000)throw new Error('Некорректный список одежды.');
  for(const [key,text] of Object.entries(outfits)){if(name(key,'Комплект')!==key)throw new Error('Пробелы по краям имени комплекта.');string(text,'Одежда');}
  if(value.variantNames!==undefined){
    if(!record(value.variantNames))throw new Error('Некорректные названия вариантов.');
    variants.variantNames={};
    for(const [kind,names] of Object.entries(value.variantNames)){
      const entries=kind==='appearance'?variants.appearances:kind==='outfit'?outfits:null;
      if(!entries||!record(names))throw new Error('Некорректные названия вариантов.');
      for(const [key,label] of Object.entries(names))if(!Object.hasOwn(entries,key)||string(label,'Название варианта',200)!==label.trim())throw new Error('Некорректное название варианта.');
      variants.variantNames[kind]={...names};
    }
  }
  if(value.variantsLinked!==undefined){if(typeof value.variantsLinked!=='boolean')throw new Error('Некорректный режим связи.');variants.variantsLinked=value.variantsLinked;}
  if(value.variantLinks!==undefined){
    if(!record(value.variantLinks))throw new Error('Некорректные связи вариантов.');
    const used=new Set();
    for(const [appearance,outfit] of Object.entries(value.variantLinks)) {
      if(!variants.appearances||!Object.hasOwn(variants.appearances,appearance)||typeof outfit!=='string'||!Object.hasOwn(outfits,outfit)||used.has(outfit))throw new Error('Некорректная или неоднозначная пара вариантов.');
      used.add(outfit);
    }
    variants.variantLinks={...value.variantLinks};
  }
  const active=value.activeOutfitName??Object.keys(outfits)[0];
  if(typeof active!=='string'||!Object.hasOwn(outfits,active))throw new Error('Выбранный комплект отсутствует.');
  if(value.outfitEnabled!==undefined&&typeof value.outfitEnabled!=='boolean')throw new Error('Некорректное включение одежды.');
  const source=value.source??{};
  if(!record(source))throw new Error('Некорректные метаданные источника.');
  const metadata={};
  for(const key of ['title','author','url','base','version','description'])if(source[key]!==undefined)metadata[key]=string(source[key],key);
  if(metadata.url){let url;try{url=new URL(metadata.url);}catch{throw new Error('Некорректная ссылка источника.');}if(!['https:','http:'].includes(url.protocol))throw new Error('Источник должен быть ссылкой HTTP или HTTPS.');}
  for(const key of ['triggers','tags'])if(source[key]!==undefined){if(!Array.isArray(source[key])||source[key].length>10000)throw new Error(`Некорректный список ${key}.`);metadata[key]=source[key].map(text=>string(text,key));}
  return {name:name(value.name,'Имя'),universe:string(value.universe??'','Вселенная',500),description:string(value.description??'','Описание'),appearance:string(value.appearance??'','Внешность'),...variants,lora,strength,outfits:{...outfits},activeOutfitName:active,outfitEnabled:value.outfitEnabled??true,source:metadata};
}

export function serializePrism(character) {
  const text=JSON.stringify({format:'prism-character',version:1,character:characterData(character)},null,2);
  if(new TextEncoder().encode(text).length>MAX_PRISM_BYTES)throw new Error('Карточка превышает 2 МБ.');
  return text;
}

export function parsePrism(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_PRISM_BYTES)throw new Error('Карточка превышает 2 МБ.');
  let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('Файл .prism должен содержать корректный JSON.');}
  if(!record(data)||data.format!=='prism-character'||data.version!==1)throw new Error('Неподдерживаемый формат или версия .prism.');
  return characterData(data.character);
}

export function resolveCharacterLora(lora, items) {
  if(lora==='None')return 'None';
  const path=normalize(lora),exact=items.find(item=>normalize(item.name)===path);
  if(exact)return exact.name;
  const matches=items.filter(item=>normalize(item.name).split('/').at(-1)===path.split('/').at(-1));
  return matches.length===1?matches[0].name:null;
}
