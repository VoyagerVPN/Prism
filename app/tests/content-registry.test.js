import test from 'node:test';
import assert from 'node:assert/strict';


test('устаревший backend сообщает о перезапуске вместо ошибки JSON-парсинга', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async ()=>new Response('File Not Found',{status:404,headers:{'Content-Type':'text/plain'}});
  try{
    const {loadContentRegistry}=await import('../content_registry.js');
    await assert.rejects(
      loadContentRegistry({force:true}),
      error=>error.status===404&&error.message==='Хранилище контента не зарегистрировано сервером Prism. Перезапустите backend после обновления.',
    );
  }finally{globalThis.fetch=originalFetch;}
});


test('импорт создаёт и затем дополняет durable content entity вместо браузерного события-заглушки', async () => {
  const originalFetch=globalThis.fetch;
  let document={content:{},revision:null};
  const writes=[];
  globalThis.fetch=async (url,options={})=>{
    if(url!=='/prism/content')return Response.json({error:'unexpected URL'},{status:404});
    if((options.method??'GET')==='GET')return Response.json(document);
    const body=JSON.parse(options.body);writes.push(body);
    document={content:structuredClone(body.content),revision:`r${writes.length}`};
    return Response.json(document);
  };
  try{
    const {loadContentRegistry,persistContentImport,getPersistedContentEntities}=await import('../content_registry.js');
    await loadContentRegistry({force:true});
    const created=await persistContentImport({
      action:'create',contentType:'Style',name:'Мягкий свет',base:'Illustrious',
      source:{name:'Style/Illustrious/soft.safetensors'},
    });
    const entity=created.entities[0];
    assert.equal(entity.type,'Style');
    assert.notEqual(entity.id,'Style/Illustrious/soft.safetensors');
    assert.deepEqual(entity.bindings,[{
      kind:'lora',name:'Style/Illustrious/soft.safetensors',strength:1,clipStrength:1,
      compatibleRecipes:['checkpoint'],
    }]);

    await persistContentImport({
      action:'attach',target:entity,base:'Anima',
      source:{name:'Style/Anima/soft-anima.safetensors'},
    });

    assert.equal(writes.length,2);
    assert.equal(writes[1].revision,'r1');
    assert.deepEqual(getPersistedContentEntities()[0].bindings.map(binding=>[binding.name,binding.compatibleRecipes]),[
      ['Style/Illustrious/soft.safetensors',['checkpoint']],
      ['Style/Anima/soft-anima.safetensors',['anima']],
    ]);
  }finally{globalThis.fetch=originalFetch;}
});

test('attach может материализовать существующую проекцию каталога и не дублирует источник', async () => {
  const originalFetch=globalThis.fetch;
  let document={content:{},revision:null};
  globalThis.fetch=async (_url,options={})=>{
    if((options.method??'GET')==='GET')return Response.json(document);
    const body=JSON.parse(options.body);document={content:structuredClone(body.content),revision:'saved'};return Response.json(document);
  };
  try{
    const {loadContentRegistry,persistContentImport}=await import('../content_registry.js');
    await loadContentRegistry({force:true});
    const target={
      id:'concept:soft',type:'Concept',name:'Мягкость',scopes:['global'],
      bindings:[{kind:'prompt',positive:['soft focus'],negative:[]}],
    };
    const intent={action:'attach',target,base:'Illustrious',source:{name:'Concept/soft.safetensors'}};
    const first=await persistContentImport(intent);
    const second=await persistContentImport(intent);
    assert.equal(first.entities[0].id,target.id);
    assert.equal(second.entities[0].bindings.filter(binding=>binding.kind==='lora').length,1);
  }finally{globalThis.fetch=originalFetch;}
});

test('триггеры импортированного стиля сохраняются и используют совместимый рецепт Qwen',async()=>{
  const originalFetch=globalThis.fetch;let document={content:{},revision:null};
  globalThis.fetch=async (_url,options={})=>{
    if(options.method==='POST')document={content:JSON.parse(options.body).content,revision:'saved'};
    return Response.json(document);
  };
  try{
    const {loadContentRegistry,persistContentImport}=await import('../content_registry.js');await loadContentRegistry({force:true});
    const {entity}=await persistContentImport({action:'create',contentType:'Style',name:'Тушь',base:'Qwen Image 2.1',trigger:'ink, monochrome',source:{name:'Style/Qwen/ink.safetensors'}});
    assert.deepEqual(entity.bindings.find(binding=>binding.kind==='prompt').positive,['ink, monochrome']);
    assert.deepEqual(entity.bindings.find(binding=>binding.kind==='lora').compatibleRecipes,['qwen-image-2.1']);
  }finally{globalThis.fetch=originalFetch;}
});
