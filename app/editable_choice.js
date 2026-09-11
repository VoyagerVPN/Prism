// Свободное название и выбор существующей записи — разные действия.
export function createEditableChoice({id,label,placeholder,maxLength,readName,commitName,options,choose,filter=false,onEnter=()=>{},scrollContainer}) {
  const root=document.createElement('div');root.className='editable-choice';
  const input=document.createElement('input');input.id=id;input.type='text';input.maxLength=maxLength;
  input.placeholder=placeholder;input.autocomplete='off';input.setAttribute('aria-label',label);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='editable-choice-toggle';toggle.setAttribute('aria-label',`Выбрать: ${label}`);
  toggle.innerHTML='<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
  const menu=document.createElement('div');menu.className='editable-choice-menu';menu.id=id+'-options';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);
  input.setAttribute('aria-controls',menu.id);root.append(input,toggle,menu);
  const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false');};
  const sync=()=>{input.value=readName();input.removeAttribute('aria-invalid');};
  const commit=()=>{const valid=commitName(input.value.trim());input.setAttribute('aria-invalid',String(!valid));if(valid)sync();return valid;};
  const position=()=>{
    const rect=root.getBoundingClientRect(),height=window.innerHeight,below=height-rect.bottom-12,above=rect.top-12,up=below<180&&above>below;
    Object.assign(menu.style,{left:rect.left+'px',width:rect.width+'px',top:up?'auto':rect.bottom+2+'px',bottom:up?height-rect.top+2+'px':'auto',maxHeight:Math.max(80,Math.min(280,up?above:below))+'px'});
  };
  const open=(filterInput=false)=>{
    menu.replaceChildren();
    const query=filter&&filterInput?input.value.trim().toLocaleLowerCase('ru'):'';
    for(const option of options().filter(option=>!query||option.label.toLocaleLowerCase('ru').includes(query))){
      const button=document.createElement('button');button.type='button';button.textContent=option.label;button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));
      button.onmousedown=event=>event.preventDefault();
      button.onclick=()=>{if(!commit())return;choose(option.value);sync();close();input.focus();close();};
      button.onkeydown=event=>{
        if(event.key==='Escape'){event.preventDefault();close();input.focus();close();}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const items=[...menu.children],index=items.indexOf(button);items[(index+(event.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}
      };
      menu.append(button);
    }
    if(!menu.children.length){close();return;}
    position();
    menu.hidden=false;input.setAttribute('aria-expanded','true');
  };
  input.onfocus=()=>open();
  input.onclick=()=>open();
  input.oninput=()=>{input.removeAttribute('aria-invalid');if(filter)open(true);else close();};
  input.onchange=()=>commit();
  input.onkeydown=event=>{
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault();if(commit()){close();onEnter();}}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();sync();close();}
    if(event.key==='ArrowDown'){event.preventDefault();if(commit()){open();(menu.querySelector('[aria-selected="true"]')||menu.firstElementChild)?.focus();}}
  };
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)){commit();close();}});
  toggle.onmousedown=event=>event.preventDefault();
  toggle.onclick=()=>{if(!menu.hidden){close();return;}if(commit())open();};
  const scroll=event=>{if(!menu.hidden&&!menu.contains(event.target))position();};
  const dialog=scrollContainer??document.getElementById('lora-library-details');dialog.addEventListener('scroll',scroll,true);
  sync();
  return {root,input,sync,commit,focus:()=>{input.focus();input.select();},destroy:()=>dialog.removeEventListener('scroll',scroll,true)};
}
