import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';
import {categoryLabel,contentActionLabel,promptCategoryIcon} from '../lora_categories.js';

test('категории и действия библиотеки переводятся без изменения внутренних идентификаторов',async()=>{
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  const dom=new JSDOM('');
  try{
    assert.equal(categoryLabel('Character'),'Characters');
    assert.equal(contentActionLabel('Style'),'Add style');
    assert.equal(promptCategoryIcon(dom.window.document,'Pose').title,'Poses');
    assert.equal(categoryLabel('UserDefined'),'UserDefined');
    await l10n.changeLanguage('ru');
    assert.equal(categoryLabel('Character'),'Персонажи');
  }finally{setActiveLocalization(null);dom.window.close();}
});
