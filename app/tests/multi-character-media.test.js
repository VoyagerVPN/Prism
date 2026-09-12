import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('изображение общей LoRA требует явного выбора персонажа', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true,runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const sourceImage={id:'7',url:'https://image.civitai.com/x/7.webp',width:768,height:1024,nsfwLevel:1,source:'civitai'};
  const lora={name:'Character/shared.safetensors',title:'Общая LoRA',category:'Character',base:'Illustrious',version:'',author:'',tags:[],triggers:[],preview:sourceImage.url,cover:null,images:[sourceImage],description:'',url:''};
  let characters=Object.fromEntries(['Алиса','Боб'].map(name=>[name,{name,lora:lora.name,strength:1,appearance:'',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true}]));
  let assigned;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/characters')return Response.json({characters,revision:'r1'});
    if(url==='/prism/lora-library')return Response.json({items:[lora]});
    if(url==='/prism/media/assign'){
      assigned=JSON.parse(options.body);characters={...characters,Боб:{...characters.Боб,portrait:{id:'b'.repeat(64),source:assigned.source}}};
      return Response.json({characters,revision:'r2',media:characters.Боб.portrait});
    }
    throw new Error(`Неожиданный запрос ${url}`);
  };
  try{
    const {initCharacters}=await import('../characters.js');const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    document.querySelector('.library-open').click();
    const picker=document.querySelector('#library-character-editor [aria-label="Сохранённый персонаж"]');
    assert.deepEqual([...picker.options].map(option=>option.value),['Алиса','Боб']);
    picker.value='Боб';picker.dispatchEvent(new Event('change'));
    document.querySelector('[data-media-action="character-portrait"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(assigned,{source:{kind:'civitai',lora:lora.name,id:'7'},target:{kind:'character',name:'Боб'},revision:'r1'});
    assert.equal(document.getElementById('media-assignment-dialog'),null,'Цель уже выбрана в редакторе персонажа');
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
