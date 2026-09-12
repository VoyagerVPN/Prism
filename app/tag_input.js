export function splitPromptTags(words) {
  const result=[];
  for(const source of words) {
    let start=0,depth=0,escaped=false;
    for(let i=0;i<source.length;i++) {
      const char=source[i];
      if(escaped){escaped=false;continue;}
      if(char==='\\'){escaped=true;continue;}
      if(char==='('||char==='[')depth++;
      if(char===')'||char===']')depth=Math.max(0,depth-1);
      if((char===','||char==='\n'||char==='\r')&&depth===0){const word=source.slice(start,i).trim();if(word)result.push(word);start=i+1;}
    }
    const tail=source.slice(start).trim();if(tail)result.push(tail);
  }
  return [...new Set(result)];
}

export function createTagInput(field,{kind,label,icon,onChange,onFocus=()=>{},toggle}) {
  const win=field.ownerDocument.defaultView;
  const initial=field.value;
  field.value=JSON.stringify(splitPromptTags([initial]).map(value=>({value})));
  const widget=new win.Tagify(field,{
    delimiters:null,duplicates:false,onChangeAfterBlur:false,backspace:toggle?false:'edit',
    originalInputValueFormat:values=>values.map(item=>item.value).join(', '),
    dropdown:{enabled:false},a11y:{focusableTags:true,inputAriaLabel:label},
    editTags:{clicks:toggle?1:2,keepInvalid:false},
    templates:{tag(data){
      // Tagify экранирует value/title перед вызовом шаблона.
      const action=toggle?'toggle':'remove',verb=toggle?'Исключить':'Удалить';
      return `<tag title="${data.title}" contenteditable="false" tabindex="0" class="tagify__tag"><div><svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg><span class="tagify__tag-text">${data.value}</span></div><button type="button" class="tagify__tag__${action}Btn" aria-label="${verb} тег ${data.value}" title="${verb} тег"><svg class="ui-icon" aria-hidden="true"><use href="#icon-${toggle?'eye':'close'}"/></svg></button></tag>`;
    }},
  });
  widget.DOM.scope.dataset.tagKind=kind;
  widget.DOM.scope.classList.add('prompt-tags');
  field.hidden=true;
  widget.DOM.scope.addEventListener('pointerdown',event=>{
    if(toggle||event.target!==widget.DOM.scope)return;
    const bounds=widget.DOM.scope.getBoundingClientRect();
    if(bounds.width&&event.clientX>=bounds.right-18)return;
    event.preventDefault();
    widget.DOM.input.focus({preventScroll:true});
    const selection=win.getSelection();
    if(!selection)return;
    const range=field.ownerDocument.createRange();range.selectNodeContents(widget.DOM.input);range.collapse(false);
    selection.removeAllRanges();selection.addRange(range);
  },true);
  const refreshActions=()=>{
    if(!toggle)return;
    for(const tag of widget.getTagElms()){
      const value=widget.getSetTagData(tag).value,off=toggle.isDisabled(value),button=tag.querySelector('.tagify__tag__toggleBtn');
      tag.classList.toggle('is-disabled',off);button.setAttribute('aria-label',`${off?'Вернуть':'Исключить'} тег ${value}`);button.setAttribute('aria-pressed',String(!off));button.title=off?'Вернуть в промпт':'Исключить из промпта';button.querySelector('use').setAttribute('href',`#icon-${off?'eye-off':'eye'}`);
    }
  };
  if(toggle){widget.DOM.scope.classList.add('prompt-tags-toggle');widget.DOM.input.hidden=true;refreshActions();}
  widget.DOM.scope.addEventListener('click',event=>{
    const button=event.target.closest('.tagify__tag__removeBtn,.tagify__tag__toggleBtn');
    if(!button)return;
    event.preventDefault();event.stopPropagation();
    const tag=button.closest('.tagify__tag');
    if(toggle){toggle.onToggle(widget.getSetTagData(tag).value);refreshActions();onChange();}
    else widget.removeTags(tag,false,0);
  },true);
  // Стандартное деление по запятой разрушает веса и группы в промптах.
  const normalize=widget.normalizeTags.bind(widget);
  widget.normalizeTags=items=>normalize(typeof items==='string'?splitPromptTags([items]):items);
  let changing=false;
  const changed=()=>{if(changing)return;field.value=widget.getInputValue();refreshActions();field.dispatchEvent(new win.Event('input'));onChange();};
  let editingValue;
  widget.on('edit:start',event=>{editingValue=event.detail.data.value;});
  widget.on('edit:beforeUpdate',event=>{
    if(toggle){const previous=editingValue??event.detail.previousData.value,next=event.detail.data.value??'';if(previous!==next)toggle.onEdit(previous,next);}
    editingValue=undefined;
  });
  widget.on('add remove edit:updated',changed);
  widget.DOM.scope.addEventListener('focusin',onFocus);
  widget.DOM.scope.addEventListener('pointerdown',onFocus);
  const sync=value=>{
    if(value===widget.getInputValue())return;
    changing=true;widget.removeAllTags();widget.addTags(splitPromptTags([value]),true,true);field.value=widget.getInputValue();refreshActions();changing=false;
  };
  const read=()=>{
    if(field.value!==widget.getInputValue())sync(field.value);
    const editing=widget.DOM.scope.querySelector('.tagify__tag--editable .tagify__tag-text');
    if(editing)editing.blur();
    const pending=widget.DOM.input.textContent.trim();
    if(pending)widget.addTags(pending,true,true);
    field.value=widget.getInputValue();return field.value;
  };
  return {
    read,sync,
    add:text=>{read();widget.addTags(splitPromptTags([text]),true,true);field.value=widget.getInputValue();},
    values:()=>widget.value.map(item=>item.value),
    focus:()=>widget.DOM.input.focus(),
    setActive:active=>widget.DOM.scope.classList.toggle('prompt-tags-active',active),
    destroy:()=>widget.destroy(),
  };
}
