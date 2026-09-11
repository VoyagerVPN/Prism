(async()=>{
 const {loadLoraLibrary}=await import('./library.js');await loadLoraLibrary();
 const root=document.getElementById('lora-library'),tabs=document.getElementById('lora-library-categories');
 if(!tabs)throw new Error('Нет разделения по категориям');
 const search=document.getElementById('lora-library-search');search.value='';search.dispatchEvent(new Event('input'));
 document.getElementById('lora-library-base').tomselect.setValue('all');
 const utility=[...tabs.querySelectorAll('button')].find(b=>b.dataset.category==='Utility');if(!utility)throw new Error('Нет категории Utility');utility.click();
 const cards=[...root.querySelectorAll('.library-card')];if(cards.length!==2||cards.some(c=>!c.dataset.name.startsWith('Utility')))throw new Error('Категория смешивает разные папки');
 tabs.querySelector('[data-category="all"]').click();
 const {items}=await(await fetch('/prism/lora-library')).json(),item=items.find(i=>i.triggers.length);
 const card=[...root.querySelectorAll('.library-card')].find(c=>c.dataset.name===item.name),button=card.querySelector('.library-copy');
 const actions=card.querySelector('.library-card-actions');
 if(actions.children.length!==3||!actions.children[0].classList.contains('library-add-icon')||actions.children[1]!==button)throw new Error('Нет единого ряда +, copy, обновить');
 if(!button)throw new Error('Нет кнопки копирования кейвордов');
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');let copied;
 try{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value;}}});
  button.click();await new Promise(r=>setTimeout(r,30));
  if(copied!==item.triggers.join(', ')||button.querySelector('use')?.getAttribute('href')!=='#icon-check')throw new Error('Копируются не все кейворды');
  await new Promise(r=>setTimeout(r,1550));
  if(button.querySelector('use')?.getAttribute('href')!=='#icon-copy'||button.textContent)throw new Error('Иконка копирования не вернулась');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}});
  button.click();await new Promise(r=>setTimeout(r,30));
  const dialog=document.getElementById('action-dialog');if(!dialog.open||dialog.querySelector('input').value!==copied)throw new Error('Нет fallback без доступа к буферу');dialog.querySelector('[type=submit]').click();
  return 'Категории по папкам, все кейворды, подтверждение копирования и fallback: OK';
 }finally{if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else delete navigator.clipboard;}
})()
