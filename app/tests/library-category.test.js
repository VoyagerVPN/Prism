import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Категория меняется явно, а просмотр Character LoRA не подменяется редактором персонажа',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost/prism/',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.eval(await readFile(new URL('../vendor-tagify.js',import.meta.url),'utf8'));
  const keys=['window','document','Event','CustomEvent','Option','MutationObserver','localStorage','fetch'];
  const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  for(const key of keys.filter(key=>key!=='fetch'))globalThis[key]=key==='window'?dom.window:dom.window[key];
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  dom.window.HTMLElement.prototype.showPopover=function(){this.hidden=false;};
  dom.window.HTMLElement.prototype.hidePopover=function(){if(!this.isConnected)throw new Error('Popover is detached');this.hidden=true;};
  let item={name:'Other/anima/slavya.safetensors',title:'Slavya',category:'Other',base:'anima',version:'',author:'',tags:['character'],triggers:['slavya'],preview:'',description:'',url:''};
  let reject=false,writes=0,defer=false,release;
  globalThis.fetch=async(url,options={})=>{
    if(url==='/prism/lora-library')return Response.json({items:[item]});
    assert.equal(url,'/prism/lora-library/category');assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);assert.equal(body.name,item.name);
    if(reject)return Response.json({error:'Нет доступа к записи'},{status:400});
    if(defer)await new Promise(resolve=>{release=resolve;});
    writes++;item={...item,category:body.category};return Response.json(item);
  };
  const waitFor=async predicate=>{for(let step=0;step<30&&!predicate();step++)await new Promise(resolve=>setTimeout(resolve,0));assert.ok(predicate());};
  try{
    const {loadLoraLibrary}=await import('../library.js');
    await loadLoraLibrary();
    assert.equal(document.querySelector('.library-actions > summary').textContent,'Добавить','Импорт и создание не спрятаны за безымянным плюсом');
    const firstName=item.name;
    const categoryButton=()=>document.querySelector('.library-card [aria-label="Изменить категорию: Slavya"]');
    assert.ok(categoryButton(),'Категория доступна как кнопка');
    assert.equal(categoryButton().textContent,'','На карточке категория не расходует место на подпись');
    assert.match(categoryButton().title,/Прочее/,'Текущая категория остаётся доступна в подсказке');
    categoryButton().click();
    const choose=value=>document.querySelector(`.library-category-menu [data-category="${value}"]`).click();
    choose('Character');await waitFor(()=>document.querySelector('.library-card .library-category-button use')?.getAttribute('href')==='#icon-person');
    assert.equal(writes,1);assert.equal(item.name,firstName,'Ссылки на файл не меняются');
    assert.match(document.getElementById('lora-library-categories').textContent,/Персонажи · 1/);
    document.querySelector('.library-open').click();
    assert.equal(document.getElementById('library-character-editor'),null,'«Подробнее» оставляет просмотр метаданных');
    assert.match(document.getElementById('lora-library-details').textContent,/slavya/,'Триггеры Character LoRA остаются видимыми');
    document.getElementById('lora-library-details').close();await loadLoraLibrary();
    assert.equal(categoryButton().querySelector('use').getAttribute('href'),'#icon-person','Повторная загрузка сохраняет категорию');
    defer=true;categoryButton().click();choose('Style');document.querySelector('.library-category-menu').remove();release();
    await waitFor(()=>categoryButton().querySelector('use').getAttribute('href')==='#icon-brush');
    reject=true;categoryButton().click();choose('Other');await waitFor(()=>document.querySelector('.library-category-menu [role="status"]')?.textContent==='Нет доступа к записи');
    assert.equal(categoryButton().querySelector('use').getAttribute('href'),'#icon-brush','При ошибке категория не меняется');
  }finally{document.getElementById('library-character-editor')?.dispatchEvent(new Event('dispose-editor'));document.body.replaceChildren();(await import('../controls.js')).syncSelectControls();Object.assign(globalThis,originals);dom.window.close();}
});
