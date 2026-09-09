// Связи взаимно однозначны и хранятся отдельно от режима совместного выбора.
export function variantName(character,kind,key) {
  return character.variantNames?.[kind]?.[key]??key;
}

export function variantOptionLabel(character,kind,key) {
  const values=kind==='appearance'?character.appearances:character.outfits;
  return variantName(character,kind,key)||`Без названия · ${Object.keys(values).indexOf(key)+1}`;
}

export function selectCharacterVariant(character, kind, name) {
  if(kind==='appearance') {
    character.activeAppearanceName=name;
    const pair=character.variantLinks?.[name];
    if(character.variantsLinked&&pair&&Object.hasOwn(character.outfits,pair))character.activeOutfitName=pair;
  } else {
    character.activeOutfitName=name;
    const pair=Object.entries(character.variantLinks??{}).find(([,outfit])=>outfit===name)?.[0];
    if(character.variantsLinked&&pair&&Object.hasOwn(character.appearances,pair))character.activeAppearanceName=pair;
  }
  character.appearance=character.appearances[character.activeAppearanceName]??'';
}

export function toggleCharacterVariantLink(character) {
  character.variantsLinked=!character.variantsLinked;
  if(!character.variantsLinked)return;
  character.variantLinks??={};
  for(const [appearance,outfit] of Object.entries(character.variantLinks)) {
    if(appearance===character.activeAppearanceName||outfit===character.activeOutfitName)delete character.variantLinks[appearance];
  }
  character.variantLinks[character.activeAppearanceName]=character.activeOutfitName;
}

export function renameCharacterVariantLink(character,kind,previous,next) {
  const links=character.variantLinks??{};
  if(kind==='appearance'&&Object.hasOwn(links,previous)){links[next]=links[previous];delete links[previous];}
  if(kind==='outfit')for(const appearance of Object.keys(links))if(links[appearance]===previous)links[appearance]=next;
}

export function renderVariantLink(button,character) {
  const linked=character.variantsLinked===true;
  button.setAttribute('aria-pressed',String(linked));
  const paired=character.variantLinks?.[character.activeAppearanceName]===character.activeOutfitName;
  const label=linked?'Отключить связанное переключение':'Связать выбранную внешность и одежду';
  button.setAttribute('aria-label',label);button.title=label+(linked&&!paired?' — у текущего сочетания нет пары':'');
  button.innerHTML=`<svg class="ui-icon" aria-hidden="true"><use href="#icon-${linked?'link':'unlink'}"/></svg>`;
}
