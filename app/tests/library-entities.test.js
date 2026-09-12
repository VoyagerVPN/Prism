import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('вкладка персонажей показывает профили, а остальные категории — LoRA', async () => {
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/'});
  const keys=['window','document','CustomEvent','Event','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const loras=[
    {name:'Character/haaru.safetensors',title:'Haaru',category:'Character',base:'Illustrious',version:'v1',author:'Автор',tags:[],triggers:['haaru'],preview:'/haaru.webp',cover:null,images:[],description:'',url:''},
    {name:'Character/toriel.safetensors',title:'Toriel LoRA',category:'Character',base:'Illustrious',version:'v1',author:'',tags:[],triggers:['toriel'],preview:'/toriel.webp',cover:null,images:[],description:'',url:''},
    {name:'Style/light.safetensors',title:'Свет',category:'Style',base:'Illustrious',version:'',author:'',tags:[],triggers:[],preview:'',cover:null,images:[],description:'',url:''},
  ];
  const characters={
    Undyne:{name:'Undyne',universe:'Undertale',lora:loras[0].name,strength:1,appearance:'blue body',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true,portrait:{id:'a'.repeat(64)}},
    Muffet:{name:'Muffet',universe:'Undertale',lora:loras[0].name,strength:1,appearance:'purple body',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true},
    Inkling:{name:'Inkling',universe:'Original',lora:loras[2].name,strength:1,appearance:'',outfits:{Обычно:''},activeOutfitName:'Обычно',outfitEnabled:true},
  };
  globalThis.fetch=async url=>{
    if(url.endsWith('/object_info'))return Response.json({LoraLoader:{input:{required:{lora_name:[loras.map(item=>item.name)]}}}});
    return url==='/prism/characters'?Response.json({characters,revision:'r1'}):Response.json({items:loras});
  };
  try{
    const {fetchComfyInfo}=await import('../api.js');await fetchComfyInfo();
    const {initCharacters}=await import('../characters.js');
    const {loadLoraLibrary}=await import('../library.js');
    await initCharacters();await loadLoraLibrary();
    assert.equal(document.querySelector('[data-library-mode]'),null,'Отдельных режимов персонажей и LoRA нет');
    const cards=[...document.querySelectorAll('.library-card')];
    assert.deepEqual(cards.map(card=>[card.dataset.libraryEntity,card.querySelector('.library-card-title span:last-child').textContent]),[
      ['character','Undyne'],['character','Muffet'],['character','Inkling'],['character-source','Toriel LoRA'],['lora','Свет'],
    ]);
    assert.equal(cards[0].querySelector('.library-preview img').getAttribute('src'),`/prism/media?id=${'a'.repeat(64)}`);
    assert.equal(cards[1].querySelector('.library-preview img').getAttribute('src'),'/haaru.webp');
    assert.equal(document.querySelectorAll('.library-use-character').length,3);
    assert.equal(document.querySelector('.library-create-character').textContent,'Создать персонажа');
    const {setupPromptEditor}=await import('../prompt_editor.js'),editor=setupPromptEditor();
    editor.write([{type:'text',text:'@'}]);const mentionText=editor.root.firstChild,range=document.createRange();range.setStart(mentionText,mentionText.length);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);editor.root.dispatchEvent(new Event('input',{bubbles:true}));
    assert.deepEqual([...document.querySelectorAll('#prompt-lora-mentions [role="option"]')].map(option=>option.textContent),['Undyne','Muffet','Inkling','Свет'],'@ разделяет профили, обычные LoRA и несохранённые персонажные источники');
    editor.write([{type:'text',text:''}]);
    const styleCard=document.querySelector('[data-library-entity="lora"]');
    styleCard.querySelector('.library-add').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(document.querySelectorAll('#positive-prompt-editor .prompt-character').length,0,'Обычная LoRA не подменяется связанным персонажем');
    assert.equal(document.querySelector('#positive-prompt-editor .prompt-content')?.dataset.contentType,'Style');
    assert.equal(JSON.parse(document.querySelector('#positive-prompt-editor .prompt-content').dataset.content).snapshot.bindings[0].name,loras[2].name);
    assert.match(document.getElementById('lora-library-categories').textContent,/Персонажи · 4/);
    document.querySelector('[data-category="Character"]').click();
    assert.deepEqual([...document.querySelectorAll('.library-card')].map(card=>card.dataset.libraryEntity),['character','character','character','character-source']);
  }finally{document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
