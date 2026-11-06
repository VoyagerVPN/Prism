// Запускается в изолированной установленной панели с доступным ComfyUI.
(async () => {
  const wait=async predicate=>{
    for(let attempt=0;attempt<300;attempt++){
      if(predicate())return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Истекло ожидание обновления интерфейса');
  };
  const initial=document.documentElement.lang, originalFetch=window.fetch;
  let releaseRefresh=null;
  const changeLanguage=async language=>{
    if(document.documentElement.lang===language)return;
    document.getElementById('prism-settings-open').click();
    document.getElementById('preference-language').value=language;
    document.querySelector('#prism-settings form').requestSubmit();
    await wait(()=>document.documentElement.lang===language&&!document.getElementById('prism-settings').open);
  };
  try{
    await changeLanguage('en');
    const button=document.getElementById('refresh-models-btn'),status=document.getElementById('model-scan-status');
    button.click();
    await wait(()=>!button.disabled&&status.textContent.startsWith('List updated:'));
    const english=status.textContent;
    await changeLanguage('ru');
    if(!status.textContent.startsWith('Список обновлён:'))throw new Error(`Статус поиска не переведён на русский: ${status.textContent}`);
    await changeLanguage('en');
    if(status.textContent!==english)throw new Error(`Статус поиска не вернулся на английский: ${status.textContent}`);
    window.fetch=(input,options)=>String(input).endsWith('/prism/refresh')
      ?new Promise((resolve,reject)=>{releaseRefresh=()=>originalFetch(input,options).then(resolve,reject);})
      :originalFetch(input,options);
    button.click();await wait(()=>button.disabled&&releaseRefresh);
    await changeLanguage('ru');
    if(status.textContent!=='Поиск файлов моделей на диске…')throw new Error(`Процесс поиска не переведён: ${status.textContent}`);
    releaseRefresh();releaseRefresh=null;
    await wait(()=>!button.disabled&&status.textContent.startsWith('Список обновлён:'));
    await changeLanguage('en');
    window.fetch=(input,options)=>String(input).endsWith('/prism/refresh')?Promise.reject(new Error('offline-test')):originalFetch(input,options);
    button.click();await wait(()=>!button.disabled&&status.textContent.startsWith('Could not refresh the list:'));
    await changeLanguage('ru');
    if(status.textContent!=='Не удалось обновить список: offline-test')throw new Error(`Ошибка поиска не переведена: ${status.textContent}`);
    return {english,russianSwitch:true,runningScanSwitch:true,failedScanSwitch:true};
  }finally{releaseRefresh?.();window.fetch=originalFetch;await changeLanguage(initial);}
})();
