import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('из карточки персонажа создаётся ещё один профиль той же LoRA', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true,runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const lora={name:'Character/haaru.safetensors',title:'Haaru',category:'Character',base:'Anima',version:'v1',author:'',tags:[],triggers:['haaru'],preview:'/haaru.webp',cover:null,images:[],description:'',url:''};
  let characters={Undyne:{name:'Undyne',universe:'Undertale',lora:lora.name,strength:1,appearance:'blue body',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true}},revision='r1';
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/lora-library')return Response.json({items:[lora]});
    assert.equal(url,'/prism/characters');
    if(options.method==='POST'){characters=JSON.parse(options.body).characters;revision='r2';}
    return Response.json({characters,revision});
  };
  try{
    const {initCharacters}=await import('../characters.js');
    const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    document.querySelector('[data-library-entity="character"] .library-open').click();
    assert.equal(document.getElementById('profile-character-name').value,'Undyne');
    assert.equal(document.getElementById('library-detail-title').textContent,'Undyne','Редактор профиля называется персонажем, а не техническим источником');
    assert.equal(document.querySelector('#lora-library-details .library-category-button').getAttribute('aria-label'),'Изменить категорию: Undyne');
    const create=document.querySelector('.library-create-related-character');
    assert.equal(create?.textContent,'Создать ещё персонажа');
    create.click();
    assert.equal(document.getElementById('profile-character-name').value,'Haaru');
    document.getElementById('profile-character-name').value='Muffet';
    const form=document.querySelector('#library-character-editor form');
    await form.onsubmit({preventDefault(){}});
    assert.deepEqual(Object.keys(characters),['Undyne','Muffet']);
    assert.deepEqual([...document.querySelectorAll('[data-library-entity="character"] .library-card-title span:last-child')].map(node=>node.textContent),['Undyne','Muffet']);
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
