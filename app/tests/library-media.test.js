import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('редактор персонажа назначает только портрет, а технические детали LoRA — только обложку', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true,runScripts:'outside-only'});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const image=id=>({id:String(id),url:`https://image.civitai.com/x/${id}.webp`,width:768,height:1024,nsfwLevel:1,source:'civitai'});
  let lora={name:'Character/shared.safetensors',title:'Общая LoRA',category:'Character',base:'Illustrious',version:'v1',author:'Автор',tags:[],triggers:['alice','bob'],preview:image(1).url,cover:null,images:[],description:'',url:''};
  const style={name:'Style/ink.safetensors',title:'Ink',category:'Style',base:'Illustrious',version:'v1',author:'Автор',tags:[],triggers:['ink'],preview:image(3).url,cover:null,images:[image(3)],description:'',url:''};
  let revision='r1';
  let characters={Алиса:{name:'Алиса',lora:lora.name,strength:1,appearance:'',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true}};
  const assignments=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/characters')return Response.json({characters,revision});
    if(url==='/prism/lora-library')return Response.json({items:[lora,style]});
    if(url==='/prism/lora-library/lookup'){
      assert.deepEqual(JSON.parse(options.body),{name:lora.name});
      lora={...lora,images:[image(1),image(2)]};
      return Response.json(lora);
    }
    if(url==='/prism/media/assign'){
      const body=JSON.parse(options.body);assignments.push(body);
      const media={id:(body.target.kind==='lora'?'c':'p').repeat(64),source:body.source,url:`/prism/media?id=${body.target.kind}`};
      if(body.target.kind==='lora'){lora={...lora,cover:media,preview:media.url};return Response.json({media,item:lora});}
      characters={...characters,Алиса:{...characters.Алиса,portrait:media}};revision='r2';return Response.json({characters,revision,media});
    }
    throw new Error(`Неожиданный запрос ${url}`);
  };
  try{
    const {initCharacters}=await import('../characters.js');
    const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    document.querySelector('.library-open').click();
    const refresh=document.querySelector('[data-media-action="refresh-civitai"]');
    assert.equal(refresh?.textContent,'Загрузить изображения Civitai');
    refresh.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(document.querySelectorAll('.library-media-rail [data-civitai-image]').length,2);
    assert.equal(document.querySelectorAll('[data-media-action="lora-cover"]').length,0);
    assert.equal(document.querySelectorAll('[data-media-action="character-portrait"]').length,2);
    assert.ok([...document.querySelectorAll('[data-media-action="character-portrait"]')].every(button=>button.textContent==='Сделать портретом'));
    document.querySelector('[data-civitai-image="1"] [data-media-action="character-portrait"]').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(assignments[0],{source:{kind:'civitai',lora:lora.name,id:'1'},target:{kind:'character',name:'Алиса'},revision:'r1'});
    document.getElementById('lora-library-details').close();document.querySelector('.library-open').click();
    assert.equal(document.querySelector('.library-current-media img').src,`http://localhost/prism/media?id=${'p'.repeat(64)}`);
    document.getElementById('lora-library-details').close();document.querySelector('[data-library-entity="lora"] .library-open').click();
    assert.equal(document.querySelectorAll('[data-media-action="character-portrait"]').length,0);
    assert.equal(document.querySelectorAll('[data-media-action="lora-cover"]').length,1);
    assert.equal(document.querySelector('[data-media-action="lora-cover"]').textContent,'Сделать обложкой источника');
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
