import {makeDialogBackdropDismissible} from './popup_behavior.js';

const storageKey='prism_first_run_v1';
const modelPage='https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0';

export function setupFirstRun({doc=document,storage=window.localStorage,readiness,applyExample=()=>{},importModel=()=>{}}) {
  let returning=false;
  try{returning=Boolean(storage.getItem('matrix_dashboard_v3'));}catch{/* Браузер может запретить localStorage. */}
  const dialog=doc.createElement('dialog');
  dialog.id='first-run';dialog.className='app-dialog first-run-dialog';
  dialog.setAttribute('aria-labelledby','first-run-title');
  dialog.innerHTML=`<h2 id="first-run-title">Первый запуск Prism</h2>
    <p>Prism работает внутри ComfyUI. Генерацию выполняют ComfyUI и выбранная вами модель.</p>
    <ol class="first-run-steps">
      <li><h3>Подключение</h3><p data-backend></p><p>Панель использует backend по адресу этой страницы. Для другой установки откройте её адрес с окончанием <code>/prism/</code>. Локальный запуск: <code>Prism.bat</code>.</p></li>
      <li><h3>Модель</h3><p data-models role="status"></p><p>Для начала подойдёт <a href="${modelPage}" target="_blank" rel="noopener noreferrer">SDXL Base от Stability AI</a>: один checkpoint .safetensors, около 6,94 ГБ, с собственными условиями использования. Setup.ps1 может загрузить его с проверкой SHA256. Либо добавьте совместимый SDXL / SD1.5 checkpoint через импорт. Отдельные UNet и LoRA требуют своих компонентов.</p><button type="button" data-import>Добавить файл модели</button></li>
      <li><h3>Первое изображение</h3><p>Подготовьте пример: один кадр 512 × 512, 20 шагов, без дополнительных обработок. Проверьте текст во вкладке «Создание» и нажмите «Запуск». Первый кадр включает загрузку весов в память. Результат появится в рабочей области и галерее.</p><button type="button" data-example disabled>Подготовить пример</button><p>Для редактора Qwen, FaceDetailer, Face Swap и увеличения нужны дополнительные модели и узлы. Для первого изображения они не требуются.</p></li>
    </ol><p data-error role="alert"></p><div class="dialog-actions"><button type="button" data-check>Проверить снова</button><button type="button" data-close class="dialog-primary">Закрыть</button></div>`;
  doc.body.append(dialog);
  makeDialogBackdropDismissible(dialog);
  const example=dialog.querySelector('[data-example]'),checkButton=dialog.querySelector('[data-check]');
  let selected=null;
  async function check() {
    example.disabled=true;selected=null;checkButton.disabled=true;
    dialog.querySelector('[data-error]').textContent='';
    dialog.querySelector('[data-models]').textContent='Проверка моделей…';
    try {
      const status=await readiness();
      dialog.querySelector('[data-backend]').textContent=`${status.backend} · ComfyUI ${status.version}`;
      const available=status.models.filter(model=>!model.reason);
      const missing=status.models.filter(model=>model.reason).map(model=>model.reason);
      dialog.querySelector('[data-models]').textContent=available.length
        ? `Доступно моделей: ${available.length}. ${available.map(model=>model.name).join(', ')}`
        : ['Модель не найдена. Установите SDXL через Setup.ps1 или добавьте файл модели, затем проверьте снова.',...missing].join(' ');
      selected=available.find(model=>model.name.replaceAll('\\','/').split('/').at(-1)==='sd_xl_base_1.0.safetensors')
        ??available.find(model=>model.recipe==='checkpoint');
      example.disabled=!selected;
      if(available.length&&!selected)dialog.querySelector('[data-models]').append(' Пример ниже предназначен для SDXL / SD1.5 checkpoint. Выберите вашу модель в «Создании» и используйте её рецепт.');
    } catch(error) {
      dialog.querySelector('[data-backend]').textContent=doc.location.origin;
      dialog.querySelector('[data-models]').textContent='Готовность моделей не проверена.';
      dialog.querySelector('[data-error]').textContent=`Не удалось проверить ComfyUI: ${error.message}. Проверьте адрес страницы и журнал запуска, затем повторите проверку.`;
    } finally { checkButton.disabled=false; }
  }
  const remember=()=>{try{storage.setItem(storageKey,'seen');}catch{/* Приватный режим браузера не блокирует подсказки. */}};
  dialog.querySelector('[data-close]').onclick=()=>{remember();dialog.close();};
  dialog.addEventListener('close',remember);
  checkButton.onclick=()=>void check();
  dialog.querySelector('[data-import]').onclick=()=>{dialog.close();importModel();};
  example.onclick=()=>{if(selected){applyExample(selected.name);remember();dialog.close();}};
  async function open(){if(!dialog.open)dialog.showModal();await check();}
  doc.getElementById('first-run-open')?.addEventListener('click',()=>void open());
  return {check,open,async openIfNeeded(){
    let seen=false;
    try{seen=storage.getItem(storageKey)==='seen'||returning;}catch{/* Показываем помощь без сохранения предпочтения. */}
    if(!seen)await open();
  }};
}
