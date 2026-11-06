import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createLocalization,setActiveLocalization} from '../i18n.js';

test('поиск в раскрывающемся списке переключает язык без изменения выбора',async()=>{
  const dom=new JSDOM('<body><label for="x">Model</label><select id="x"><option value="a">A</option></select></body>',{url:'http://localhost/'});
  for(const key of ['window','document','MutationObserver','Element','HTMLSelectElement'])globalThis[key]=key==='window'?dom.window:dom.window[key];
  let instance;
  globalThis.TomSelect=class {
    constructor(select,settings){instance=this;this.select=select;this.settings=settings;this.focus_node=document.createElement('div');this.control_input=document.createElement('input');this.isDisabled=false;}
    clearOptions(){} sync(){} getValue(){return this.select.value;} setValue(value){this.select.value=value;} disable(){this.isDisabled=true;} enable(){this.isDisabled=false;} destroy(){}
  };
  const l10n=await createLocalization({storage:{getItem:()=>null,setItem:()=>{}},systemLanguage:'en'});setActiveLocalization(l10n);
  try{
    const {setupSelectControls}=await import('../controls.js');setupSelectControls();
    assert.equal(instance.control_input.placeholder,'Search…');
    assert.match(instance.settings.render.no_results(),/No results/);
    await l10n.changeLanguage('ru');
    dom.window.dispatchEvent(new dom.window.CustomEvent('prism-language-changed'));
    assert.equal(instance.control_input.placeholder,'Найти…');
    assert.equal(document.getElementById('x').value,'a');
  }finally{setActiveLocalization(null);dom.window.close();}
});
