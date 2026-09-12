import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('сгенерированный арт назначается персонажу или LoRA с карточки и из лайтбокса', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',pretendToBeVisual:true});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const image={filename:'alice.png',subfolder:'Prism',type:'output'};
  const item={id:'art-alice',image,kind:'art',parentId:null,childIds:[],favorite:false,createdAt:1,operationId:'job'};
  const operation={id:'job',kind:'txt2img',status:'succeeded',promptId:'prompt',createdAt:1,sourceArtIds:[],outputArtIds:[item.id],gridArtId:null,characters:[{name:'Алиса',lora:'Character/alice.safetensors'}],settings:{},workflow:{}};
  let character={name:'Алиса',lora:'Character/alice.safetensors',strength:1,appearance:'',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true};
  let lora={name:character.lora,title:'Alice LoRA',category:'Character',base:'Illustrious',version:'',author:'',tags:[],triggers:[],preview:'',cover:null,images:[],description:'',url:''};
  const assigned=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/characters')return Response.json({characters:{Алиса:character},revision:'r1'});
    if(url==='/prism/lora-library')return Response.json({items:[lora]});
    if(url==='/prism/media/assign'){
      const body=JSON.parse(options.body);assigned.push(body);const media={id:(body.target.kind==='character'?'a':'b').repeat(64),source:body.source};
      if(body.target.kind==='character'){character={...character,portrait:media};return Response.json({characters:{Алиса:character},revision:'r2',media});}
      lora={...lora,cover:{...media,url:'/prism/media?id=cover'},preview:'/prism/media?id=cover'};return Response.json({item:lora,media});
    }
    throw new Error(`Неожиданный запрос ${url}`);
  };
  const fetchCatalog=async()=>Response.json({version:3,items:[item],operations:[operation]});
  try{
    const {initCharacters}=await import('../characters.js');const {loadLoraLibrary}=await import('../library.js');const {initArchiveGallery}=await import('../archive_gallery.js');const gallery=await import('../gallery.js');
    await initCharacters();await loadLoraLibrary();await initArchiveGallery({fetchImpl:fetchCatalog,migrate:false});gallery.initGalleryEvents();
    const {galleryCatalogHistory}=await import('../gallery_catalog_client.js');const historyItem=galleryCatalogHistory()[0];gallery.updateHistory([historyItem]);gallery.selectHistoryItem(historyItem);
    assert.equal(document.getElementById('output-use-as-btn').disabled,false);
    const cardAction=document.querySelector('[data-gallery-id="art-alice"] .archive-use-as');cardAction.click();await new Promise(resolve=>setImmediate(resolve));
    let dialog=document.getElementById('media-assignment-dialog');
    assert.equal(dialog.open,true);assert.deepEqual([...dialog.querySelector('[name="media-kind"]').options].map(option=>option.textContent),['Портрет персонажа','Обложка источника']);
    dialog.querySelector('form').requestSubmit();await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(assigned[0],{source:{kind:'gallery',id:item.id},target:{kind:'character',name:'Алиса'},revision:'r1'});
    gallery.openLightboxGallery([item],item.id);
    const lightboxAction=document.getElementById('lightbox-use-as-btn');assert.equal(lightboxAction.disabled,false);lightboxAction.click();await new Promise(resolve=>setImmediate(resolve));
    dialog=document.getElementById('media-assignment-dialog');dialog.querySelector('[name="media-kind"]').value='lora';dialog.querySelector('[name="media-kind"]').dispatchEvent(new Event('change'));dialog.querySelector('form').requestSubmit();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(assigned[1],{source:{kind:'gallery',id:item.id},target:{kind:'lora',name:lora.name}});
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
