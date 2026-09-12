import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {characterPromptPart} from '../prompt_parts.js';


test('поза назначается конкретному экземпляру персонажа, а не выдаётся за глобальный эффект',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const pose={name:'Pose/run.safetensors',title:'Бег',category:'Pose',base:'Illustrious',version:'',author:'',tags:[],triggers:['running'],preview:'',cover:null,images:[],description:'',url:''};
  globalThis.fetch=async url=>{
    if(url==='/prism/characters')return Response.json({characters:{},revision:'characters-r1'});
    if(url==='/prism/content')return Response.json({content:{},revision:null});
    if(url==='/prism/lora-library')return Response.json({items:[pose]});
    return Response.json({error:`unexpected ${url}`},{status:404});
  };
  try{
    const character={name:'Mira',lora:'None',strength:1,appearance:'silver hair',outfits:{Обычно:'navy coat'},activeOutfitName:'Обычно',outfitEnabled:true};
    const {initCharacters}=await import('../characters.js');
    const {setupPromptEditor}=await import('../prompt_editor.js');
    const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();const editor=setupPromptEditor();
    editor.write([characterPromptPart(character,{instanceId:'mira-frame'})]);
    await loadLoraLibrary();
    document.querySelector('[data-content-type="Pose"] .library-add').click();
    await new Promise(resolve=>setImmediate(resolve));
    const content=editor.read().find(part=>part.type==='content');
    assert.equal(content.scope,'subject');
    assert.equal(content.subjectId,'mira-frame');
    assert.equal(content.snapshot.parameters.subjectName,'Mira');
    assert.match(document.querySelector('.prompt-content').textContent,/Mira/);
  }finally{document.body.replaceChildren();Object.assign(globalThis,originals);dom.window.close();}
});
