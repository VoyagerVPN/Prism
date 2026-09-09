import { loraList } from './api.js';
import { randomUuid } from './config.js';
import { syncPromptLoras } from './prompt_editor.js';
import { loraKey } from './prompt_parts.js';

export let activeLoras = [];

export function addLora(name = 'None') {
  if(name==='None'||!loraList.includes(name)||activeLoras.some(lora=>loraKey(lora.name)===loraKey(name)))return;
  const character=document.getElementById('character-select');
  if(character?.value!=='none'&&document.getElementById('char-lora-select')?.value&&loraKey(document.getElementById('char-lora-select').value)===loraKey(name)){
    window.dispatchEvent(new CustomEvent('dashboard-warning',{detail:'Эта LoRA уже подключена активным персонажем.'}));return;
  }
  activeLoras.push({id:randomUuid(),name,strength:1});renderLoraStack();
  window.dispatchEvent(new Event('save-settings'));
}

export function updateActiveLoras(newList) { activeLoras=newList; }
export function renderLoraStack() { syncPromptLoras(activeLoras); }

window.addEventListener('prompt-loras-changed',event=>{
  activeLoras=event.detail.map(lora=>({...lora,id:activeLoras.find(item=>loraKey(item.name)===loraKey(lora.name))?.id??randomUuid()}));
});
