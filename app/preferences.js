import {makeDialogBackdropDismissible} from './popup_behavior.js';
import {translate as tr} from './i18n.js';

export const defaultPreferences=Object.freeze({initialAppearanceName:'По умолчанию',initialOutfitName:'По умолчанию',initialOutfitEnabled:true,loraWeightDisplay:'always',autoCivitaiMetadata:true});
const storageKey='prism_preferences_v1';
const localizedDefaults=()=>({...defaultPreferences,initialAppearanceName:tr('settings.defaultVariant','По умолчанию'),initialOutfitName:tr('settings.defaultVariant','По умолчанию')});

function normalizePreferences(value) {
  const result=localizedDefaults();
  for(const field of ['initialAppearanceName','initialOutfitName']){
    if(typeof value?.[field]!=='string'||value[field].length>200||['none','__proto__','constructor','prototype'].includes(value[field].trim()))throw new Error(tr('settings.invalidName','Название должно быть не длиннее 200 символов и не использовать служебные имена.'));
    result[field]=value[field].trim();
  }
  if(typeof value.initialOutfitEnabled!=='boolean'||!['always','modified'].includes(value.loraWeightDisplay)||typeof value.autoCivitaiMetadata!=='boolean')throw new Error(tr('settings.invalid','Некорректные предпочтения Prism.'));
  result.initialOutfitEnabled=value.initialOutfitEnabled;result.loraWeightDisplay=value.loraWeightDisplay;result.autoCivitaiMetadata=value.autoCivitaiMetadata;
  return result;
}

export function readPreferences(storage=window.localStorage) {
  try{return normalizePreferences({...localizedDefaults(),...JSON.parse(storage.getItem(storageKey)??'{}')});}
  catch{return localizedDefaults();}
}

export function savePreferences(value,storage=window.localStorage) {
  const preferences=normalizePreferences(value);
  storage.setItem(storageKey,JSON.stringify(preferences));
  return preferences;
}

export function setupPreferences({doc=document,storage=window.localStorage,localization=null}={}) {
  const button=doc.getElementById('prism-settings-open');if(!button)return;
  let dialog=doc.getElementById('prism-settings');
  if(!dialog){
    dialog=doc.createElement('dialog');dialog.id='prism-settings';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','prism-settings-title');
    dialog.innerHTML='<form><h2 id="prism-settings-title" data-i18n="settings.title">Настройки Prism</h2><p class="preferences-scope" data-i18n="settings.scope">Предпочтения для этого браузера.</p><fieldset><legend data-i18n="settings.variants">Первичные варианты персонажа</legend><p data-i18n="settings.variantsHelp">Имена при первом создании персонажа из карточки или вручную. Впоследствии их можно стереть или изменить. Дополнительные варианты создаются без имени.</p><label for="preference-appearance-name" data-i18n="settings.appearance">Начальное имя внешности</label><input type="text" id="preference-appearance-name" maxlength="200"><label for="preference-outfit-name" data-i18n="settings.outfit">Начальное имя комплекта одежды</label><input type="text" id="preference-outfit-name" maxlength="200"></fieldset><p id="prism-settings-status" role="status"></p><div class="dialog-actions"><button type="button" data-defaults data-i18n="settings.defaults">Значения по умолчанию</button><button type="button" data-cancel data-i18n="settings.cancel">Отмена</button><button type="submit" class="dialog-primary" data-i18n="settings.save">Сохранить</button></div></form>';
    doc.body.append(dialog);
    const outfitLabel=doc.createElement('label');outfitLabel.className='preference-checkbox';outfitLabel.innerHTML='<input type="checkbox" id="preference-outfit-enabled"> <span data-i18n="settings.outfitEnabled">Включать одежду у нового персонажа</span>';dialog.querySelector('fieldset').append(outfitLabel);
    const prompt=doc.createElement('fieldset');prompt.innerHTML='<legend data-i18n="settings.prompt">Промпт</legend><label for="preference-lora-weight" data-i18n="settings.weight">Показывать интенсивность подключённого контента</label><select id="preference-lora-weight" data-native="true"><option value="always" data-i18n="settings.always">Всегда</option><option value="modified" data-i18n="settings.modified">Только изменённую</option></select><p data-i18n="settings.weightHelp">Меняет только отображение. Интенсивность и содержимое промпта сохраняются.</p>';dialog.querySelector('#prism-settings-status').before(prompt);
    const civitai=doc.createElement('fieldset');civitai.innerHTML='<legend data-i18n="settings.import">Импорт LoRA</legend><label class="preference-checkbox"><input type="checkbox" id="preference-civitai-metadata"> <span data-i18n="settings.metadata">Автоматически загружать метаданные Civitai</span></label><p data-i18n="settings.metadataHelp">После сохранения LoRA Prism передаёт Civitai хеш файла и получает название, автора, триггеры, превью и описание.</p>';dialog.querySelector('#prism-settings-status').before(civitai);
    if(localization){const language=doc.createElement('fieldset');language.innerHTML='<label for="preference-language" data-i18n="settings.language">Язык</label><select id="preference-language" data-native="true"><option value="en">English</option><option value="ru">Русский</option></select>';dialog.querySelector('form').insertBefore(language,dialog.querySelector('fieldset'));}
  }
  makeDialogBackdropDismissible(dialog);
  const appearance=dialog.querySelector('#preference-appearance-name'),outfit=dialog.querySelector('#preference-outfit-name'),status=dialog.querySelector('[role="status"]');
  const enabled=dialog.querySelector('#preference-outfit-enabled'),weights=dialog.querySelector('#preference-lora-weight'),civitaiMetadata=dialog.querySelector('#preference-civitai-metadata');
  const language=dialog.querySelector('#preference-language');
  const translate=()=>{if(localization?.t)for(const element of dialog.querySelectorAll('[data-i18n]'))element.textContent=localization.t(element.dataset.i18n);};translate();
  const apply=()=>{doc.body.dataset.loraWeightDisplay=readPreferences(storage).loraWeightDisplay;};apply();
  const fill=preferences=>{appearance.value=preferences.initialAppearanceName;outfit.value=preferences.initialOutfitName;enabled.checked=preferences.initialOutfitEnabled;weights.value=preferences.loraWeightDisplay;civitaiMetadata.checked=preferences.autoCivitaiMetadata;status.textContent='';};
  button.onclick=()=>{fill(readPreferences(storage));if(language)language.value=localization.language;translate();dialog.showModal();};
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-defaults]').onclick=()=>fill(localizedDefaults());
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    let languageChanged=false;
    const publishLanguage=()=>{translate();doc.defaultView.dispatchEvent(new doc.defaultView.CustomEvent('prism-language-changed',{detail:{language:localization.language}}));};
    try{
      const candidate=normalizePreferences({...readPreferences(storage),initialAppearanceName:appearance.value,initialOutfitName:outfit.value,initialOutfitEnabled:enabled.checked,loraWeightDisplay:weights.value,autoCivitaiMetadata:civitaiMetadata.checked});
      const changed=language&&language.value!==localization.language;
      if(changed){await localization.changeLanguage(language.value);languageChanged=true;}
      const preferences=savePreferences(candidate,storage);apply();doc.defaultView.dispatchEvent(new doc.defaultView.CustomEvent('prism-preferences-changed',{detail:preferences}));dialog.close();
      if(languageChanged)publishLanguage();
    }
    catch(error){if(languageChanged)publishLanguage();const message=error.message==='PRISM_LANGUAGE_WRITE'&&localization?.t?localization.t('settings.languageSaveFailed'):error.message;status.textContent=localization?.t?localization.t('settings.notSaved',{message,interpolation:{escapeValue:false}}):`Не сохранено: ${message}`;}
  };
  doc.defaultView.addEventListener('storage',event=>{if(event.key===storageKey)apply();});
}
