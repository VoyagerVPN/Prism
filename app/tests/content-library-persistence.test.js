import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('durable entity объединяет backend-источники и выбирает реализацию под recipe',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  const source=(name,base)=>({name,title:name.split('/').at(-1),category:'Style',base,version:'',author:'',tags:[],triggers:[],preview:'',cover:null,images:[],description:'',url:''});
  const items=[source('Style/Illustrious/soft.safetensors','Illustrious'),source('Style/Anima/soft.safetensors','Anima')];
  const content={'style:soft':{
    id:'style:soft',type:'Style',name:'Мягкий свет',scopes:['global'],bindings:[
      {kind:'prompt',positive:['soft lighting'],negative:[]},
      {kind:'lora',name:items[0].name,strength:0.8,clipStrength:0.8,compatibleRecipes:['checkpoint']},
      {kind:'lora',name:items[1].name,strength:0.6,clipStrength:0.6,compatibleRecipes:['anima']},
    ],
  }};
  globalThis.fetch=async url=>{
    if(url==='/prism/characters')return Response.json({characters:{},revision:'characters-r1'});
    if(url==='/prism/content')return Response.json({content,revision:'content-r1'});
    if(url==='/prism/lora-library')return Response.json({items});
    return Response.json({error:`unexpected ${url}`},{status:404});
  };
  try{
    const {initCharacters}=await import('../characters.js');
    const {setupPromptEditor}=await import('../prompt_editor.js');
    const {loadLoraLibrary,getContentImportTargets}=await import('../library.js');
    await initCharacters();setupPromptEditor();await loadLoraLibrary();
    const cards=[...document.querySelectorAll('.library-card')];
    assert.equal(cards.length,1);
    assert.equal(cards[0].dataset.contentId,'style:soft');
    assert.equal(cards[0].querySelector('.library-card-title span:last-child').textContent,'Мягкий свет');
    assert.equal(
      [...cards[0].querySelectorAll('button')].some(button=>/soft\.safetensors|Style\/Illustrious/i.test(button.getAttribute('aria-label')??'')),
      false,
      'Доступные названия действий не должны раскрывать backend-файл смысловой сущности',
    );
    assert.deepEqual(getContentImportTargets().map(({id})=>id),['style:soft']);
    cards[0].querySelector('.library-add').click();
    let token=JSON.parse(document.querySelector('.prompt-content').dataset.content);
    assert.deepEqual(token.snapshot.bindings.map(binding=>binding.name),[items[0].name]);
    document.querySelector('.prompt-content-remove').click();
    window.dispatchEvent(new CustomEvent('model-recipe-changed',{detail:{recipe:'anima'}}));
    document.querySelector('.library-add').click();
    token=JSON.parse(document.querySelector('.prompt-content').dataset.content);
    assert.deepEqual(token.snapshot.bindings.map(binding=>binding.name),[items[1].name]);
    document.querySelector('.library-open').click();
    assert.equal(document.querySelector('.library-trigger-list').textContent,'soft lighting','Карточка показывает сохранённые триггеры, а не пустые метаданные файла');
  }finally{document.body.replaceChildren();Object.assign(globalThis,originals);dom.window.close();}
});
