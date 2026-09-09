(async()=>{
 const {readSettings,applySettings}=await import('./storage.js');const {activeLoras}=await import('./lora.js');const original=readSettings(),stored=localStorage.getItem('matrix_dashboard_v3');
 const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 await(await import('./library.js')).loadLoraLibrary();
 const root=document.getElementById('lora-library');if(!root)throw new Error('Библиотека LoRA отсутствует');
 const response=await fetch('/dashboard/lora-library');if(!response.ok)throw new Error('API библиотеки недоступен');const {items}=await response.json();if(!items.length)throw new Error('Локальные LoRA не показаны');
 if((await fetch('/dashboard/lora-preview?name=../prism.json')).status!==404)throw new Error('Превью допускает чужой путь');
 if((await fetch('/dashboard/lora-library/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'../prism.json'})})).status!==400)throw new Error('Поиск допускает чужой путь');
 const search=document.getElementById('lora-library-search'),base=document.getElementById('lora-library-base'),dialog=document.getElementById('lora-library-details');
 const setSearch=value=>{search.value=value;search.dispatchEvent(new Event('input',{bubbles:true}));};
 try{
  document.querySelector('[data-mobile-panel=settings]').click();document.querySelector('#settings-tab-image').click();
  base.tomselect.setValue('all');setSearch('');await tick();
  if(root.querySelectorAll('.library-card').length!==items.length)throw new Error('Не все локальные файлы показаны');
  const item=items.find(item=>item.name.startsWith('Utility')&&item.preview.startsWith('/dashboard/')&&item.triggers.length&&item.author&&item.tags.length&&item.description);if(!item)throw new Error('Нет карточек с полными метаданными');
  setSearch(item.title);await tick();const card=[...root.querySelectorAll('.library-card')].find(card=>card.dataset.name===item.name);if(!card)throw new Error('Поиск не нашёл LoRA');
  card.scrollIntoView({block:'center'});await tick();
  const image=card.querySelector('img');await image.decode();if(!image.naturalWidth)throw new Error('Превью не загрузилось');
  card.querySelector('.library-open').click();await tick();
  if(!dialog.open||!dialog.textContent.includes(item.triggers[0])||dialog.querySelector('.library-civitai-link').href!==item.url)throw new Error('Подробности не открылись');
  const detailIcons=[...dialog.querySelectorAll('.library-detail-meta .ui-icon use')].map(icon=>icon.getAttribute('href'));
  for(const icon of ['#icon-palette','#icon-user-circle','#icon-cube','#icon-tag'])if(!detailIcons.includes(icon))throw new Error(`В подробностях LoRA нет иконки ${icon}`);
  if(dialog.querySelector('[data-detail=author] span').textContent!==item.author)throw new Error('К имени автора добавлен лишний префикс');
  if(dialog.querySelector('.library-description use')?.getAttribute('href')!=='#icon-document')throw new Error('У описания нет иконки документа');
  if(dialog.querySelector('.library-keywords-row h3 use')?.getAttribute('href')!=='#icon-keywords')throw new Error('У заголовка триггеров нет иконки');
  if(dialog.querySelector('.library-civitai-link use')?.getAttribute('href')!=='#icon-civitai')throw new Error('У ссылки Civitai нет логотипа');
  const civitaiPaths=[...document.querySelectorAll('#icon-civitai path')].map(path=>path.getAttribute('d'));
  if(civitaiPaths[0]!=='M22.392 6L12 0 1.608 6v12L12 24l10.392-6V6zm-3.407 1.967L12 3.934 5.015 7.967v8.066L12 20.065l6.985-4.032V7.967z')throw new Error('Используется не логотип Civitai из theSVG');
  const fileLink=dialog.querySelector('.library-file-link');if(fileLink?.textContent!==item.name||fileLink.tagName!=='A'||!fileLink.href.includes('/dashboard/lora-library/reveal?'))throw new Error('Файл LoRA не открывается обычной ссылкой');
  const titleBox=dialog.querySelector('h2').getBoundingClientRect(),closeBox=dialog.querySelector('.dialog-heading button').getBoundingClientRect();
  if(titleBox.right>closeBox.left+1 || titleBox.bottom>dialog.querySelector('.dialog-heading').getBoundingClientRect().bottom+1)throw new Error('Заголовок перекрывает закрытие');
  dialog.querySelector('.dialog-heading button').click();
  applySettings({...original,loras:[]});card.querySelector('.library-add').click();
  const settings=readSettings();if(settings.loras.length!==1||settings.loras[0].name!==item.name||settings.loras[0].strength!==1)throw new Error('Подключена неверная LoRA');
  if(!card.querySelector('.library-add').disabled)throw new Error('Нет состояния «Добавлена»');
  const slider=document.querySelector('.lora-row input[type=range]');slider.value='.65';slider.dispatchEvent(new Event('input'));slider.dispatchEvent(new Event('change'));
  if(readSettings().loras[0].strength!==.65)throw new Error('Вес подключённой LoRA не работает');
  setSearch('___nothing___');if(root.querySelectorAll('.library-card').length)throw new Error('Поиск не фильтрует');setSearch('');base.tomselect.setValue(item.base);await tick();
  if(root.querySelectorAll('.library-card').length!==items.filter(x=>x.base===item.base).length)throw new Error('Фильтр базы неверен');
  if(document.documentElement.scrollWidth>innerWidth+1)throw new Error('Горизонтальное переполнение');
  return `Библиотека ${items.length} LoRA: поиск, фильтр, превью, подробности, подключение и вес — OK (${innerWidth}×${innerHeight})`;
 }finally{if(dialog.open)dialog.close();setSearch('');base.tomselect.setValue('all');applySettings(original);if(stored===null)localStorage.removeItem('matrix_dashboard_v3');else localStorage.setItem('matrix_dashboard_v3',stored);}
})()
