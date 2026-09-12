import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('content import создаёт персонажа или durable подключает источник к существующему',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  let characters={Mira:{name:'Mira',lora:'None',strength:0.8,appearance:'silver hair',outfits:{Обычно:'navy coat'},activeOutfitName:'Обычно',outfitEnabled:true}},revision='r0';
  const writes=[];
  globalThis.fetch=async (url,options={})=>{
    assert.equal(url,'/prism/characters');
    if(options.method==='POST'){
      const body=JSON.parse(options.body);assert.equal(body.revision,revision);characters=body.characters;revision=`r${writes.length+1}`;writes.push(structuredClone(characters));
    }
    return Response.json({characters,revision});
  };
  try{
    const {initCharacters,persistImportedCharacter}=await import('../characters.js');
    await initCharacters();
    await persistImportedCharacter({action:'attach',target:{characterName:'Mira'},source:{name:'Character/mira-v2.safetensors'}});
    assert.equal(writes[0].Mira.lora,'Character/mira-v2.safetensors');
    assert.equal(writes[0].Mira.appearance,'silver hair');
    await persistImportedCharacter({action:'create',name:'Nova',source:{name:'Character/nova.safetensors'}});
    assert.equal(writes[1].Nova.lora,'Character/nova.safetensors');
    assert.deepEqual(writes[1].Nova.appearances,{'По умолчанию':''});
    assert.equal(document.querySelector('#character-select option[value="Nova"]').textContent,'Nova');
  }finally{document.body.replaceChildren();Object.assign(globalThis,originals);dom.window.close();}
});
