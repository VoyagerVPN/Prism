(async () => {
  const {readSettings,applySettings} = await import('./storage.js');
  const $ = id => document.getElementById(id);
  const until = async check => { const deadline=Date.now()+15000; while(!check()) {if(Date.now()>deadline) throw new Error('Ожидание: '+$('preset-status').textContent); await new Promise(r=>setTimeout(r,30));} };
  const input = (id,value) => {$(id).value=value; $(id).dispatchEvent(new Event('input',{bubbles:true})); $(id).dispatchEvent(new Event('change',{bubbles:true}));};
  const submitName = async name => { await until(()=>$('action-dialog')?.open); $('action-input').value=name; $('action-dialog').querySelector('[type=submit]').click(); };
  const fixtureKey='prism-preset-test';
  let fixture=JSON.parse(sessionStorage.getItem(fixtureKey)||'null');
  if (!fixture) {
    fixture={name:'__browser_'+Date.now(),original:readSettings(),stored:localStorage.getItem('matrix_dashboard_v3'),selected:localStorage.getItem('prism_selected_model_preset')};
    sessionStorage.setItem(fixtureKey,JSON.stringify(fixture));
    input('steps-slider',37);
    $('save-profile-btn').click(); await submitName(fixture.name);
    await until(()=>$('profile-select').value===fixture.name && $('preset-status').textContent==='Сохранено в JSON');
    input('positive-prompt','Промпт не входит в пресет');
    if (!$('update-profile-btn').disabled) throw new Error('Промпт пометил пресет изменённым');
    input('steps-slider',38);
    if ($('update-profile-btn').disabled || !$('preset-status').textContent.startsWith('Изменено')) throw new Error('Изменение модели не отмечено');
    $('reset-profile-btn').click();
    if (readSettings().steps!==37 || !$('update-profile-btn').disabled) throw new Error('Возврат к сохранённым не работает');
    input('steps-slider',39); $('update-profile-btn').click();
    await until(()=>$('preset-status').textContent==='Сохранено в JSON');
    const saved=(await (await fetch('/prism/presets')).json()).presets[fixture.name];
    if(saved.steps!==39 || Object.keys(saved).length!==8 || 'positive' in saved) throw new Error('JSON содержит не настройки модели');
    return 'Создание, dirty-state, возврат и явное обновление JSON: OK. Перезагрузить и запустить повторно.';
  }
  try {
    await until(()=>$('profile-select').value===fixture.name);
    if(readSettings().steps!==39 || $('preset-status').textContent!=='Сохранено в JSON') throw new Error('Пресет не восстановлен после перезагрузки');
    const before=readSettings();
    $('delete-profile-btn').click(); await until(()=>$('action-dialog')?.open); $('action-dialog').querySelector('[data-cancel]').click();
    await new Promise(r=>setTimeout(r,50));
    if($('profile-select').value!==fixture.name) throw new Error('Отмена удалила пресет');
    $('delete-profile-btn').click(); await until(()=>$('action-dialog')?.open); $('action-dialog').querySelector('[type=submit]').click();
    await until(()=>$('profile-select').value==='default');
    if(JSON.stringify(before)!==JSON.stringify(readSettings())) throw new Error('Удаление изменило форму');
    if(Object.hasOwn((await (await fetch('/prism/presets')).json()).presets,fixture.name)) throw new Error('Удаление не записано');
    $('refresh-models-btn').click(); await until(()=>!$('refresh-models-btn').disabled);
    if(!$('model-scan-status').textContent.startsWith('Список обновлён:')) throw new Error('Нет результата сканирования');
    return 'Перезагрузка, отмена/удаление JSON и видимый результат сканирования: OK';
  } finally {
    applySettings(fixture.original);
    for(const [key,value] of [['matrix_dashboard_v3',fixture.stored],['prism_selected_model_preset',fixture.selected]]) {if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
    sessionStorage.removeItem(fixtureKey);
  }
})();

