import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {toggleGalleryFavorite} from '../gallery_catalog_client.js';

test('сообщение об отсутствующем кадре следует выбранному языку',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    await assert.rejects(toggleGalleryFavorite(null),/not yet in the gallery/);
    await l10n.changeLanguage('ru');
    await assert.rejects(toggleGalleryFavorite(null),/Кадр ещё не добавлен/);
  }finally{setActiveLocalization(null);}
});
