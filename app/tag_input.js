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

export function createTagInput(field,{kind,label,icon,onChange,onFocus}) {
  const initial=field.value;
  field.value=JSON.stringify(splitPromptTags([initial]).map(value=>({value})));
  const widget=new window.Tagify(field,{
    delimiters:null,duplicates:false,onChangeAfterBlur:false,backspace:'edit',
    originalInputValueFormat:values=>values.map(item=>item.value).join(', '),
    dropdown:{enabled:false},a11y:{focusableTags:true,inputAriaLabel:label},
    editTags:{clicks:2,keepInvalid:false},
    templates:{tag(data){
      // Tagify экранирует value/title перед вызовом шаблона.
      return `<tag title="${data.title}" contenteditable="false" tabindex="0" class="tagify__tag"><div><svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg><span class="tagify__tag-text">${data.value}</span></div><button type="button" class="tagify__tag__removeBtn" aria-label="Удалить тег ${data.value}" title="Удалить тег"><svg class="ui-icon" aria-hidden="true"><use href="#icon-close"/></svg></button></tag>`;
    }},
  });
  widget.DOM.scope.dataset.tagKind=kind;
  widget.DOM.scope.classList.add('prompt-tags');
  field.hidden=true;
  widget.DOM.scope.addEventListener('click',event=>{
    const button=event.target.closest('.tagify__tag__removeBtn');
    if(!button)return;
    event.preventDefault();event.stopPropagation();
    widget.removeTags(button.closest('.tagify__tag'),false,0);
  },true);
  // Стандартное деление по запятой разрушает веса и группы в промптах.
  const normalize=widget.normalizeTags.bind(widget);
  widget.normalizeTags=items=>normalize(typeof items==='string'?splitPromptTags([items]):items);
  let changing=false;
  const changed=()=>{if(changing)return;field.value=widget.getInputValue();field.dispatchEvent(new Event('input'));onChange();};
  widget.on('add remove edit:updated',changed);
  widget.DOM.scope.addEventListener('focusin',onFocus);
  widget.DOM.scope.addEventListener('pointerdown',onFocus);
  const sync=value=>{
    if(value===widget.getInputValue())return;
    changing=true;widget.removeAllTags();widget.addTags(splitPromptTags([value]),true,true);field.value=widget.getInputValue();changing=false;
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
