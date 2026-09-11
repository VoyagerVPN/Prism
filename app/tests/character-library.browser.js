(async()=>{
 const {readSettings,applySettings}=await import('./storage.js');const {compileWorkflow}=await import('./workflow.js');
 const $=id=>document.getElementById(id),wait=async fn=>{const end=Date.now()+15000;while(!fn()){if(Date.now()>end)throw new Error('Ожидание: '+($('profile-editor-status')?.textContent||$('character-storage-status').textContent));await new Promise(r=>setTimeout(r,30));}};
 const fill=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
 const key='character-library-test';let fixture=JSON.parse(sessionStorage.getItem(key)||'null');
 await(await import('./library.js')).loadLoraLibrary();
 const {items}=await(await fetch('/prism/lora-library')).json();
 if(!fixture){
  const item=items.find(i=>i.name.startsWith('Character')&&i.triggers.length);
  fixture={name:'__library_'+Date.now(),lora:item.name,original:readSettings(),stored:localStorage.getItem('matrix_dashboard_v3'),source:item.triggers};sessionStorage.setItem(key,JSON.stringify(fixture));
  const card=[...document.querySelectorAll('.library-card')].find(c=>c.dataset.name===item.name);card.querySelector('.library-open').click();
  if(!$('library-character-editor'))throw new Error('Карточка не открыла редактор сразу');
  $('lora-library-details').close();$('add-character-btn').click();$('profile-character-lora').value=item.name;$('profile-character-lora').dispatchEvent(new Event('change'));
  const editor=$('library-character-editor');if(!editor?.isConnected || !editor.closest('#lora-library-details') || document.querySelectorAll('dialog[open]').length!==1)throw new Error('Редактор должен находиться в одном попапе LoRA');
  const sectionIcons=[...editor.querySelectorAll('.profile-section-title use')].map(icon=>icon.getAttribute('href'));
  for(const icon of ['#icon-person','#icon-palette','#icon-shirt','#icon-keywords'])if(!sectionIcons.includes(icon))throw new Error(`В редакторе нет секции ${icon}`);
  fill('profile-character-name',fixture.name);
  const first=$('profile-source-tags').querySelector('button[data-word]');fixture.base=first.dataset.word;document.querySelector('.tag-targets button[data-tag-kind=appearance]').click();first.click();
  if($('profile-character-base').value!==fixture.base)throw new Error('Тег не добавлен в основу');
  fill('profile-outfit-text','blue coat');
  $('profile-add-outfit').click();$('profile-outfit-name').value='Вечерний';$('profile-outfit-name').dispatchEvent(new Event('change'));await wait(()=>$('profile-outfit-select').value==='Вечерний');
  fill('profile-outfit-text','red dress');
  const before=(await(await fetch('/prism/characters')).json()).characters;
  if(before[fixture.name]||readSettings().selectedCharacter!==fixture.original.selectedCharacter)throw new Error('Черновик сохранился или подключился до подтверждения');
  $('profile-save-character').click();await wait(()=>!$('lora-library-details').open);
  const saved=(await(await fetch('/prism/characters')).json()).characters[fixture.name];
  if(saved.appearance!==fixture.base||saved.outfits['По умолчанию']!=='blue coat'||saved.outfits['Вечерний']!=='red dress'||saved.lora!==fixture.lora)throw new Error('Сохранён неверный образ/комплекты');
  if(readSettings().selectedCharacter!==fixture.original.selectedCharacter)throw new Error('Сохранение подключило образ без команды');
  const source=(await(await fetch('/prism/lora-library')).json()).items.find(i=>i.name===fixture.lora).triggers;
  if(JSON.stringify(source)!==JSON.stringify(fixture.source))throw new Error('Изменены данные Civitai');
  sessionStorage.setItem(key,JSON.stringify(fixture));$('lora-library-details').close();
  return 'Черновик, разделение тегов, два комплекта и сохранение без активации: OK. Перезагрузить и запустить повторно.';
 }
 try{
  const card=[...document.querySelectorAll('.library-card')].find(c=>c.dataset.name===fixture.lora);card.querySelector('.library-open').click();
  const picker=document.querySelector('[aria-label="Сохранённый персонаж"]');if(picker){picker.value=fixture.name;picker.dispatchEvent(new Event('change'));}
  $('profile-outfit-select').value='По умолчанию';$('profile-outfit-select').dispatchEvent(new Event('change'));
  const extra=items.find(i=>i.name.startsWith('Utility'));
  applySettings({...fixture.original,positive:'Scene',loras:[{name:fixture.lora,strength:.4,description:''},{name:extra.name,strength:.7,description:''}]});
  $('profile-save-character').click();await wait(()=>!$('lora-library-details').open);await(await import('./character_library.js')).useLibraryCharacter(fixture.name);
  if(readSettings().loras.length!==1||readSettings().loras[0].name!==extra.name)throw new Error('LoRA персонажа продублирована или удалена другая LoRA');
  let settings=readSettings(),graph=compileWorkflow({...settings,seed:123,batchCount:1});
  if(!graph['5'].inputs.text.includes('blue coat')||graph['5'].inputs.text.includes('red dress')||!graph['5'].inputs.text.includes(fixture.base))throw new Error('Неверный промпт из основы и одежды');
  $('lora-library-details').close();document.querySelector('[data-mobile-panel=settings]').click();$('settings-tab-image').click();
  if(!$('character-card').classList.contains('linked-character')||$('char-outfit-input').getBoundingClientRect().height)throw new Error('Активный блок не стал компактным');
  $('char-outfit-select').tomselect.setValue('Вечерний');await wait(()=>$('character-storage-status').textContent==='Изменения сохранены');
  settings=readSettings();graph=compileWorkflow({...settings,seed:123,batchCount:1});
  if(!graph['5'].inputs.text.includes('red dress')||graph['5'].inputs.text.includes('blue coat'))throw new Error('Смена комплекта не меняет промпт');
  $('char-outfit-toggle').click();await wait(()=>$('character-storage-status').textContent==='Изменения сохранены');
  graph=compileWorkflow({...readSettings(),seed:123,batchCount:1});if(graph['5'].inputs.text.includes('red dress')||!graph['5'].inputs.text.includes(fixture.base))throw new Error('Выключение одежды затронуло основу');
  $('edit-character-btn').click();await wait(()=>$('library-character-editor')?.isConnected);
  if($('profile-character-name').value!==fixture.name||$('profile-outfit-text').value!=='red dress')throw new Error('Активный блок открыл чужой редактор');
  fill('profile-character-base','несохранённый черновик');$('library-character-editor').querySelector('.close-profile-editor').click();
  if(readSettings().character.appearance!==fixture.base)throw new Error('Отмена изменила активную основу');
  $('edit-character-btn').click();$('profile-delete-character').click();await wait(()=>$('action-dialog')?.open);$('action-dialog').querySelector('[type=submit]').click();await wait(()=>!$('library-character-editor'));
  if((await(await fetch('/prism/characters')).json()).characters[fixture.name])throw new Error('Образ не удалён');
  if(!items.some(i=>i.name===fixture.lora))throw new Error('Удаление образа убрало LoRA');
  return `Перезагрузка, активация без дублей, смена/отключение одежды, отмена и удаление: OK (${innerWidth}×${innerHeight})`;
 } finally{
  for(const id of ['library-character-editor','lora-library-details'])if($(id)?.open)$(id).close();
  const current=await(await fetch('/prism/characters')).json();if(current.characters[fixture.name]){delete current.characters[fixture.name];const response=await fetch('/prism/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)});if(!response.ok)throw new Error('Не удалось удалить тестовый образ');}
  applySettings(fixture.original);if(fixture.stored===null)localStorage.removeItem('matrix_dashboard_v3');else localStorage.setItem('matrix_dashboard_v3',fixture.stored);sessionStorage.removeItem(key);
 }
})()
