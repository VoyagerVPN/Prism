import {translate as tr} from './i18n.js';

export const categories={Character:'Персонажи',Concept:'Концепты',Style:'Стили',Clothing:'Одежда',Pose:'Позы',Object:'Объекты',Background:'Фоны',Utility:'Инструменты',Other:'Прочее'};
export const categoryIcons={Character:'person',Concept:'bulb',Style:'brush',Clothing:'shirt',Pose:'pose',Object:'cube',Background:'landscape',Utility:'tool',Other:'tag'};
export const categoryOf=item=>{if(item.category)return item.category;const parts=item.name.replaceAll('\\','/').split('/');return parts.length>1?parts[0]:'Other';};

export const contentCategories=Object.freeze({Character:'Персонажи',Concept:'Концепты',Style:'Стили',Pose:'Позы',Clothing:'Одежда',Object:'Объекты',Background:'Фоны',Effect:'Эффекты',Processing:'Обработка',inbox:'Источники'});
export const contentCategoryIcons=Object.freeze({...categoryIcons,Effect:'sparkles',Processing:'tool',inbox:'inbox'});

export function contentTypeOf(item) {
  const category=categoryOf(item);
  if(['Character','Concept','Style','Pose','Clothing','Object','Background','Effect','Processing'].includes(category))return category;
  if(category!=='Utility')return 'inbox';
  const evidence=[item.name,item.title,...(item.tags??[])].join(' ').toLocaleLowerCase();
  return /processing|upscal|detail|sharpen|denois|restor|refine|обработ|детал|апскейл|резк|шум/.test(evidence)?'Processing':'Effect';
}

export const contentActionLabels=Object.freeze({Character:'Создать персонажа',Concept:'Добавить концепт',Style:'Добавить стиль',Pose:'Назначить позу',Clothing:'Добавить одежду',Object:'Добавить предмет',Background:'Выбрать фон',Effect:'Применить эффект',Processing:'Применить обработку',inbox:'Настроить источник'});
export const contentIntensityLabels=Object.freeze({Character:'Сходство персонажа',Concept:'Выраженность концепта',Style:'Выразительность стиля',Pose:'Точность позы',Clothing:'Выраженность одежды',Object:'Выраженность предмета',Background:'Влияние фона',Effect:'Сила эффекта',Processing:'Интенсивность обработки'});

export const categoryLabel=category=>tr(`category.${category}`,contentCategories[category]||categories[category]||category);
export const contentActionLabel=category=>tr(`contentAction.${category}`,contentActionLabels[category]??'Добавить');
export const contentIntensityLabel=category=>contentIntensityLabels[category]?tr(`contentIntensity.${category}`,contentIntensityLabels[category]):'';

export function promptCategoryIcon(doc,category) {
  const icon=doc.createElement('span');icon.className='prompt-category-icon';icon.setAttribute('aria-hidden','true');
  icon.title=categoryLabel(category);
  icon.innerHTML=`<svg class="ui-icon"><use href="#icon-${contentCategoryIcons[category]||categoryIcons[category]||'tag'}"/></svg>`;
  return icon;
}
