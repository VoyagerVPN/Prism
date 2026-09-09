import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrism, serializePrism, resolveCharacterLora, MAX_PRISM_BYTES } from '../character_format.js';

const character={name:'Славя',universe:'Бесконечное лето',description:'Пионерка',appearance:'Slaviachan, blue eyes',lora:'Character/Slavia.safetensors',strength:0.85,outfits:{Лето:'blue skirt',Зима:'warm coat'},activeOutfitName:'Лето',outfitEnabled:false,source:{title:'Slavia',author:'Автор',url:'https://civitai.com/models/123',base:'Illustrious',version:'v2',description:'Авторское описание',tags:['character'],triggers:['Slaviachan','blue skirt']}};

test('.prism сохраняет пустые названия вариантов отдельно от их ключей и связей',()=>{
  const value={...character,appearances:{variant_1:'eyes'},activeAppearanceName:'variant_1',variantNames:{appearance:{variant_1:''},outfit:{Лето:''}},variantLinks:{variant_1:'Лето'}};
  assert.deepEqual(parsePrism(serializePrism(value)),value);
  for(const variantNames of [{appearance:{missing:''}},{outfit:{Лето:42}},{appearance:[]}])assert.throws(()=>serializePrism({...value,variantNames}));
});

test('.prism сохраняет варианты внешности и общий триггер, проверяет выбранный вариант',()=>{
  const variants={...character,trigger:'Slaviachan',appearance:'blue eyes',appearances:{Обычная:'blue eyes',Взрослая:'long hair'},activeAppearanceName:'Обычная'};
  assert.deepEqual(parsePrism(serializePrism(variants)),variants);
  for(const change of [{appearances:[]},{appearances:{}},{activeAppearanceName:'Нет'},{trigger:42},{appearances:JSON.parse('{"__proto__":"bad"}')}])assert.throws(()=>serializePrism({...variants,...change}));
});

test('.prism сохраняет явные пары и отключённую связь, отклоняет неоднозначные ссылки',()=>{
  const paired={...character,appearances:{День:'eyes',Ночь:'hair'},activeAppearanceName:'День',variantLinks:{День:'Лето',Ночь:'Зима'},variantsLinked:false};
  assert.deepEqual(parsePrism(serializePrism(paired)),paired);
  for(const change of [{variantLinks:{Нет:'Лето'}},{variantLinks:{День:'Нет'}},{variantLinks:{День:'Лето',Ночь:'Лето'}},{variantsLinked:'yes'}])assert.throws(()=>serializePrism({...paired,...change}));
});

test('.prism сохраняет персонажа, вселенную, одежду и исходные метаданные без потерь',()=>{
  const text=serializePrism(character),envelope=JSON.parse(text);
  assert.equal(envelope.format,'prism-character');assert.equal(envelope.version,1);
  assert.deepEqual(parsePrism(text),character);
  assert.deepEqual(parsePrism('\uFEFF'+text),character);
});

test('Старая запись без вселенной и LoRA экспортируется без миграции базы',()=>{
  const old={name:'Тест',appearance:'green eyes',outfits:{Обычный:''},activeOutfitName:'Обычный'};
  const parsed=parsePrism(serializePrism(old));
  assert.equal(parsed.universe,'');assert.equal(parsed.lora,'None');assert.equal(parsed.strength,1);
  assert.equal(old.universe,undefined);
});

test('Некорректный файл и опасные значения отклоняются до сохранения',()=>{
  const raw=JSON.parse(serializePrism(character));
  for(const value of [null,[],{}, {...raw,version:2},{...raw,format:'other'}, {...raw,character:{...character,name:'__proto__'}}, {...raw,character:{...character,strength:'1'}}, {...raw,character:{...character,outfits:[]}}, {...raw,character:{...character,activeOutfitName:'Нет'}}, {...raw,character:{...character,source:{url:'javascript:alert(1)'}}}, {...raw,character:{...character,lora:'../../secret.safetensors'}}, {...raw,character:{...character,universe:42}}])assert.throws(()=>parsePrism(JSON.stringify(value)));
  assert.throws(()=>parsePrism('{broken'));
  assert.throws(()=>parsePrism(' '.repeat(MAX_PRISM_BYTES+1)));
  assert.throws(()=>serializePrism({...character,strength:Infinity}));
});

test('LoRA находится по пути или уникальному имени, неоднозначная и отсутствующая не подменяются',()=>{
  assert.equal(resolveCharacterLora('Character/Slavia.safetensors',[{name:'Character\\Slavia.safetensors'}]),'Character\\Slavia.safetensors');
  assert.equal(resolveCharacterLora('Old/Slavia.safetensors',[{name:'New/Slavia.safetensors'}]),'New/Slavia.safetensors');
  assert.equal(resolveCharacterLora('Old/Slavia.safetensors',[{name:'A/Slavia.safetensors'},{name:'B/Slavia.safetensors'}]),null);
  assert.equal(resolveCharacterLora(character.lora,[]),null);
  assert.equal(resolveCharacterLora('None',[]),'None');
});
