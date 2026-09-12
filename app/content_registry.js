import {CONTENT_TYPES, createContentCatalog, createContentEntity} from './content_catalog.js';


let state={content:{},revision:null};
let loaded=false;

function validateDocument(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!value.content||typeof value.content!=='object'||Array.isArray(value.content)||!('revision' in value)){
    throw new Error('Некорректный ответ хранилища контента.');
  }
  const entities=Object.values(value.content).map(createContentEntity);
  if(entities.some(entity=>value.content[entity.id]?.id!==entity.id))throw new Error('Ключ content entity не совпадает с semantic ID.');
  createContentCatalog(entities);
  return {content:Object.fromEntries(entities.map(entity=>[entity.id,structuredClone(entity)])),revision:value.revision};
}

async function requestContent(options={}) {
  const response=await fetch('/prism/content',{cache:'no-store',signal:AbortSignal.timeout(15000),...options});
  const raw=await response.text();
  let data;
  try{data=raw?JSON.parse(raw):{};}
  catch{
    const message=response.status===404
      ?'Хранилище контента не зарегистрировано сервером Prism. Перезапустите backend после обновления.'
      :`Хранилище контента вернуло ответ не в формате JSON: HTTP ${response.status}.`;
    const error=new Error(message);error.status=response.status;throw error;
  }
  if(!response.ok){const error=new Error(data.error??`Хранилище контента недоступно: HTTP ${response.status}`);error.status=response.status;throw error;}
  return validateDocument(data);
}

export async function loadContentRegistry({force=false}={}) {
  if(!loaded||force){state=await requestContent();loaded=true;}
  return {entities:getPersistedContentEntities(),revision:state.revision};
}

export function getPersistedContentEntities() {
  return Object.values(state.content).map(entity=>structuredClone(entity));
}

function semanticId(type,label) {
  let hash=2166136261;
  for(const symbol of `${type}\0${label.normalize('NFKC').trim()}`){hash^=symbol.codePointAt(0);hash=Math.imul(hash,16777619);}
  return `${type.toLowerCase()}:${(hash>>>0).toString(36)}`;
}

function recipeForBase(base) {
  return /anima/i.test(String(base??''))?'anima':'checkpoint';
}

function importedBinding(intent) {
  const name=intent.source?.name;
  if(typeof name!=='string'||!name.trim())throw new Error('Импортированный источник не содержит backend-имя.');
  return createContentEntity({
    id:'style:source-check',type:'Style',name:'source-check',scopes:['global'],
    bindings:[{kind:'lora',name,strength:1,clipStrength:1,compatibleRecipes:[recipeForBase(intent.base)]}],
  }).bindings[0];
}

function materialize(intent, content) {
  if(intent.action==='create'){
    if(!CONTENT_TYPES.includes(intent.contentType)||intent.contentType==='Character')throw new Error('Выберите тип новой сущности контента.');
    const name=typeof intent.name==='string'?intent.name.trim():'';
    if(!name||name.length>500)throw new Error('Укажите название новой сущности контента.');
    if(Object.values(content).some(entity=>entity.type===intent.contentType&&entity.name.localeCompare(name,undefined,{sensitivity:'accent'})===0)){
      throw new Error(`«${name}» уже существует. Выберите «Привязать к существующей».`);
    }
    let id=semanticId(intent.contentType,name),suffix=1;
    while(content[id])id=semanticId(intent.contentType,`${name}\0${++suffix}`);
    const scopes=['Pose','Clothing'].includes(intent.contentType)?['global','subject']:['global'];
    return createContentEntity({id,type:intent.contentType,name,scopes,bindings:[importedBinding(intent)]});
  }
  if(intent.action!=='attach')throw new Error('Неизвестное действие с импортированным источником.');
  const targetId=intent.target?.id;
  const base=content[targetId]??createContentEntity(intent.target);
  const source=importedBinding(intent);
  if(base.bindings.some(binding=>binding.kind==='lora'&&binding.name.replaceAll('\\','/')===source.name.replaceAll('\\','/')))return base;
  return createContentEntity({...base,bindings:[...base.bindings,source]});
}

export async function persistContentImport(intent) {
  if(intent?.action==='inbox')return {entities:getPersistedContentEntities(),revision:state.revision,entity:null};
  if(!loaded)await loadContentRegistry();
  for(let attempt=0;attempt<2;attempt++){
    const content=structuredClone(state.content);
    const entity=materialize(intent,content);content[entity.id]=entity;
    try{
      state=await requestContent({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,revision:state.revision})});
      loaded=true;
      return {entities:getPersistedContentEntities(),revision:state.revision,entity:structuredClone(state.content[entity.id])};
    }catch(error){
      if(error.status!==409||attempt>0)throw error;
      await loadContentRegistry({force:true});
    }
  }
  throw new Error('Не удалось сохранить назначение источника.');
}
