export const categories={Character:'Персонажи',Concept:'Концепты',Style:'Стили',Clothing:'Одежда',Pose:'Позы',Object:'Объекты',Background:'Фоны',Utility:'Инструменты',Other:'Прочее'};
export const categoryIcons={Character:'person',Concept:'bulb',Style:'brush',Clothing:'shirt',Pose:'pose',Object:'cube',Background:'landscape',Utility:'tool',Other:'tag'};
export const categoryOf=item=>{const parts=item.name.replaceAll('\\','/').split('/');return parts.length>1?parts[0]:'Other';};

export function promptCategoryIcon(doc,category) {
  const icon=doc.createElement('span');icon.className='prompt-category-icon';icon.setAttribute('aria-hidden','true');
  icon.title=categories[category]||category;
  icon.innerHTML=`<svg class="ui-icon"><use href="#icon-${categoryIcons[category]||'tag'}"/></svg>`;
  return icon;
}
