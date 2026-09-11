import {readCharacterToken} from './prompt_character.js';
import {createTagInput,splitPromptTags} from './tag_input.js';

export function createCharacterTagPanel(token,{doc,section,onChange}) {
  const panel=doc.createElement('span');panel.className='prompt-character-tags';panel.setAttribute('role','group');panel.setAttribute('aria-label','Теги персонажа');
  const inputs=[],c=readCharacterToken(token).character;
  for(const [kind,title,variant,source,icon] of [['appearance','Внешность',c.activeAppearanceName,c.appearances[c.activeAppearanceName],'palette'],['outfit','Одежда',c.activeOutfitName,c.outfits[c.activeOutfitName],'shirt']]){
    if(section&&section!==kind)continue;
    if(!splitPromptTags([source]).length||(kind==='outfit'&&!c.outfitEnabled)){
      const empty=doc.createElement('span');empty.className='prompt-character-tags-empty';empty.textContent=kind==='outfit'&&!c.outfitEnabled?'Одежда выключена':'Тегов нет';panel.append(empty);continue;
    }
    const sourceField=token.querySelector(`[data-character-field="${kind}"]`),field=doc.createElement('input');field.value=source;panel.append(field);
    const isDisabled=value=>JSON.parse(token.dataset.disabledTags).some(entry=>entry.kind===kind&&entry.variant===variant&&splitPromptTags([value]).includes(entry.tag));
    const updateDisabled=(previous,next,off)=>{
      const oldTags=splitPromptTags([previous]),entries=JSON.parse(token.dataset.disabledTags).filter(entry=>entry.kind!==kind||entry.variant!==variant||!oldTags.includes(entry.tag));
      if(off)for(const tag of splitPromptTags([next]))entries.push({kind,variant,tag});
      token.dataset.disabledTags=JSON.stringify(entries);
    };
    inputs.push(createTagInput(field,{kind,label:title,icon,onChange:()=>{sourceField.textContent=field.value;onChange();},toggle:{
      isDisabled,
      onToggle:value=>updateDisabled(value,value,!isDisabled(value)),
      onEdit:(previous,next)=>updateDisabled(previous,next,isDisabled(previous)),
    }}));
  }
  return {element:panel,destroy:()=>{for(const input of inputs){input.read();input.destroy();}}};
}
