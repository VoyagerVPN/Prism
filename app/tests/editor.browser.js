// Ручной запуск в консоли панели: доступность единого редактора без сохранения.
(async()=>{
 await(await import('./library.js')).loadLoraLibrary();
 document.getElementById('add-character-btn').click();
 const editor=document.getElementById('library-character-editor'),parent=document.getElementById('lora-library-details');
 try{
  if(!editor||!parent.contains(editor)||document.querySelectorAll('dialog[open]').length!==1)throw new Error('Нет единого редактора');
  for(const field of editor.querySelectorAll('textarea,input[type=text],[role=combobox]')){
   if(!field.getBoundingClientRect().height)continue;
   field.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const r=field.getBoundingClientRect();
   if(r.width<100||r.left<0||r.right>innerWidth||!field.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))throw new Error('Недоступное поле: '+field.id);
  }
  return 'Единый редактор, поля и отсутствие второго окна: OK';
 }finally{parent.close();}
})()
