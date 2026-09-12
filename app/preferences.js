import {makeDialogBackdropDismissible} from './popup_behavior.js';

export const defaultPreferences=Object.freeze({initialAppearanceName:'По умолчанию',initialOutfitName:'По умолчанию',initialOutfitEnabled:true,loraWeightDisplay:'always',autoCivitaiMetadata:true});
const storageKey='prism_preferences_v1';

function normalizePreferences(value) {
  const result={...defaultPreferences};
  for(const field of ['initialAppearanceName','initialOutfitName']){
    if(typeof value?.[field]!=='string'||value[field].length>200||['none','__proto__','constructor','prototype'].includes(value[field].trim()))throw new Error('Название должно быть не длиннее 200 символов и не использовать служебные имена.');
    result[field]=value[field].trim();
  }
  if(typeof value.initialOutfitEnabled!=='boolean'||!['always','modified'].includes(value.loraWeightDisplay)||typeof value.autoCivitaiMetadata!=='boolean')throw new Error('Некорректные предпочтения Prism.');
  result.initialOutfitEnabled=value.initialOutfitEnabled;result.loraWeightDisplay=value.loraWeightDisplay;result.autoCivitaiMetadata=value.autoCivitaiMetadata;
  return result;
}

export function readPreferences(storage=window.localStorage) {
  try{return normalizePreferences({...defaultPreferences,...JSON.parse(storage.getItem(storageKey)??'{}')});}
  catch{return {...defaultPreferences};}
}

export function savePreferences(value,storage=window.localStorage) {
  const preferences=normalizePreferences(value);
  storage.setItem(storageKey,JSON.stringify(preferences));
  return preferences;
}

export function setupPreferences({doc=document,storage=window.localStorage}={}) {
  const button=doc.getElementById('prism-settings-open');if(!button)return;
  let dialog=doc.getElementById('prism-settings');
  if(!dialog){
    dialog=doc.createElement('dialog');dialog.id='prism-settings';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','prism-settings-title');
    dialog.innerHTML='<form><h2 id="prism-settings-title">Настройки Prism</h2><p class="preferences-scope">Предпочтения для этого браузера.</p><fieldset><legend>Первичные варианты персонажа</legend><p>Имена при первом создании персонажа из карточки или вручную. Впоследствии их можно стереть или изменить. Дополнительные варианты создаются без имени.</p><label for="preference-appearance-name">Начальное имя внешности</label><input type="text" id="preference-appearance-name" maxlength="200"><label for="preference-outfit-name">Начальное имя комплекта одежды</label><input type="text" id="preference-outfit-name" maxlength="200"></fieldset><p id="prism-settings-status" role="status"></p><div class="dialog-actions"><button type="button" data-defaults>Значения по умолчанию</button><button type="button" data-cancel>Отмена</button><button type="submit" class="dialog-primary">Сохранить</button></div></form>';
    doc.body.append(dialog);
    const outfitLabel=doc.createElement('label');outfitLabel.className='preference-checkbox';outfitLabel.innerHTML='<input type="checkbox" id="preference-outfit-enabled"> Включать одежду у нового персонажа';dialog.querySelector('fieldset').append(outfitLabel);
    const prompt=doc.createElement('fieldset');prompt.innerHTML='<legend>Промпт</legend><label for="preference-lora-weight">Показывать интенсивность подключённого контента</label><select id="preference-lora-weight" data-native="true"><option value="always">Всегда</option><option value="modified">Только изменённую</option></select><p>Меняет только отображение. Интенсивность и содержимое промпта сохраняются.</p>';dialog.querySelector('#prism-settings-status').before(prompt);
    const civitai=doc.createElement('fieldset');civitai.innerHTML='<legend>Импорт LoRA</legend><label class="preference-checkbox"><input type="checkbox" id="preference-civitai-metadata"> Автоматически загружать метаданные Civitai</label><p>После сохранения LoRA Prism передаёт Civitai хеш файла и получает название, автора, триггеры, превью и описание.</p>';dialog.querySelector('#prism-settings-status').before(civitai);
  }
  makeDialogBackdropDismissible(dialog);
  const appearance=dialog.querySelector('#preference-appearance-name'),outfit=dialog.querySelector('#preference-outfit-name'),status=dialog.querySelector('[role="status"]');
  const enabled=dialog.querySelector('#preference-outfit-enabled'),weights=dialog.querySelector('#preference-lora-weight'),civitaiMetadata=dialog.querySelector('#preference-civitai-metadata');
  const apply=()=>{doc.body.dataset.loraWeightDisplay=readPreferences(storage).loraWeightDisplay;};apply();
  const fill=preferences=>{appearance.value=preferences.initialAppearanceName;outfit.value=preferences.initialOutfitName;enabled.checked=preferences.initialOutfitEnabled;weights.value=preferences.loraWeightDisplay;civitaiMetadata.checked=preferences.autoCivitaiMetadata;status.textContent='';};
  button.onclick=()=>{fill(readPreferences(storage));dialog.showModal();};
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-defaults]').onclick=()=>fill(defaultPreferences);
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    try{const preferences=savePreferences({...readPreferences(storage),initialAppearanceName:appearance.value,initialOutfitName:outfit.value,initialOutfitEnabled:enabled.checked,loraWeightDisplay:weights.value,autoCivitaiMetadata:civitaiMetadata.checked},storage);apply();doc.defaultView.dispatchEvent(new doc.defaultView.CustomEvent('prism-preferences-changed',{detail:preferences}));dialog.close();}
    catch(error){status.textContent=`Не сохранено: ${error.message}`;}
  };
  doc.defaultView.addEventListener('storage',event=>{if(event.key===storageKey)apply();});
}
