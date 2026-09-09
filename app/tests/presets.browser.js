(async () => {
  const {readSettings,applySettings} = await import('./storage.js');
  const {applyPresetData} = await import('./presets.js');
  const original = readSettings(), stored = localStorage.getItem('matrix_dashboard_v3');
  try {
    applySettings({...original,positive:'Мой сюжет',negative:'Мои исключения',width:768,height:512,batchCount:4,t2iBatchCount:4,seedMode:'lock',seedInput:'123',variationSeedInput:'456',variationStrength:.1});
    const before = readSettings();
    applyPresetData({...before,steps:37,cfg:8,positive:'Чужой сюжет',negative:'Затёрто',width:1024,height:1024,batchCount:9,t2iBatchCount:9,seedInput:'999',variationStrength:0});
    const after = readSettings();
    if (after.steps !== 37 || after.cfg !== 8) throw new Error('Параметры модели не применены');
    for (const key of Object.keys(before).filter(key => !['steps','cfg'].includes(key))) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Пресет изменил постороннее поле: ${key}`);
    }
    if ([...document.querySelector('#profile-select').options].some(option => ['fast','realistic','anime'].includes(option.value))) throw new Error('Остались выдуманные пресеты');
    if (!document.querySelector('#generation-model-card').contains(document.querySelector('#profile-select'))) throw new Error('Пресеты вне карточки модели');
    return 'Пресет меняет только модель; сюжет, seed, формат и серия сохранены: OK';
  } finally {
    applySettings(original);
    if (stored === null) localStorage.removeItem('matrix_dashboard_v3'); else localStorage.setItem('matrix_dashboard_v3',stored);
  }
})();
