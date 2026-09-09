(async()=>{
 const {openCharacterSetup}=await import('./character_library.js');const {readSettings}=await import('./storage.js');const before=readSettings();
 const source='hero, (red hair, long hair:1.2), blue\\, eyes, [hat, coat], tail\\';
 const item={name:'Character/test.safetensors',title:'Проверка разделения тегов',triggers:[source]};
 await(await import('./library.js')).loadLoraLibrary();
 document.querySelector('.library-card .library-open').click();openCharacterSetup(item);
 const editor=document.getElementById('library-character-editor'),tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 try{
  const actual=[...editor.querySelectorAll('#profile-source-tags input')].map(input=>input.value);
  const expected=['hero','(red hair, long hair:1.2)','blue\\, eyes','[hat, coat]','tail\\'];
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Повреждены группы или экранирование тегов');
  editor.querySelector('#profile-select-tags').click();editor.querySelector('#profile-tags-base').click();
  if(editor.querySelector('#profile-character-base').value!==source)throw new Error('В основу попал неполный текст');
  for(const field of editor.querySelectorAll('textarea,input[type=text],[role=combobox]')){
   if(!field.getBoundingClientRect().height)continue;field.scrollIntoView({block:'center'});await tick();const r=field.getBoundingClientRect();
   if(r.width<100||r.left<0||r.right>innerWidth||!field.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))throw new Error('Недоступное поле редактора: '+field.id);
  }
  if(document.documentElement.scrollWidth>innerWidth+1)throw new Error('Горизонтальное переполнение');
  if(JSON.stringify(readSettings())!==JSON.stringify(before))throw new Error('Редактор изменил активную форму');
  return `Группы тегов, экранирование, черновик и доступность полей: OK (${innerWidth}×${innerHeight})`;
 }finally{editor.querySelector('.close-profile-editor').click();document.getElementById('lora-library-details').close();}
})()
