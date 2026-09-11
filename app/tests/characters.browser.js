// Ручной запуск в консоли панели. Изменяет только собственную тестовую запись.
(async()=>{
 const {readSettings,applySettings}=await import('./storage.js');
 const original=readSettings(),stored=localStorage.getItem('matrix_dashboard_v3'),name='__character_'+Date.now();
 const $=id=>document.getElementById(id),wait=async predicate=>{const end=Date.now()+15000;while(!predicate()){if(Date.now()>end)throw new Error('Ожидание сохранения');await new Promise(r=>setTimeout(r,30));}};
 await(await import('./library.js')).loadLoraLibrary();
 try{
  $('add-character-btn').click();$('profile-character-name').value=name;$('profile-character-base').value='green eyes';$('profile-outfit-text').value='blue coat';
  $('profile-save-character').click();await wait(()=>!$('lora-library-details').open);await(await import('./character_library.js')).useLibraryCharacter(name);
  const saved=(await(await fetch('/prism/characters')).json()).characters[name];
  if(saved.lora!=='None'||saved.appearance!=='green eyes'||saved.outfits['По умолчанию']!=='blue coat')throw new Error('Неверно сохранён персонаж без LoRA');
  $('edit-character-btn').click();if(!$('library-character-editor')||$('profile-character-name').value!==name)throw new Error('Использован другой редактор');
  $('profile-character-base').value='discard';$('library-character-editor').querySelector('.close-profile-editor').click();
  if((await(await fetch('/prism/characters')).json()).characters[name].appearance!=='green eyes')throw new Error('Отмена сохранила черновик');
  $('edit-character-btn').click();$('profile-delete-character').click();await wait(()=>$('action-dialog')?.open);$('action-dialog').querySelector('[type=submit]').click();await wait(()=>$('character-select').value==='none');
  return 'Персонаж без LoRA: единый редактор, сохранение через HTTP, отмена и удаление — OK';
 }finally{
  $('lora-library-details').close();const current=await(await fetch('/prism/characters')).json();
  if(current.characters[name]){delete current.characters[name];const result=await fetch('/prism/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)});if(!result.ok)throw new Error('Не удалось удалить тестовую запись');}
  applySettings(original);if(stored===null)localStorage.removeItem('matrix_dashboard_v3');else localStorage.setItem('matrix_dashboard_v3',stored);
 }
})()
