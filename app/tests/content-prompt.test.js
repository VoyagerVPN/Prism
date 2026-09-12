import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {contentPromptPart, normalizePromptParts, resolvePromptParts} from '../prompt_parts.js';
import {createPromptEditor} from '../prompt_editor.js';
import {compileWorkflow} from '../workflow.js';

test('semantic content остаётся в снимке промпта и разрешается в prompt и backend без утечки идентичности файла', () => {
  const content={
    type:'content',
    contentId:'style:cinematic',
    contentType:'Style',
    name:'Кинематографический свет',
    scope:'global',
    snapshot:{
      prompt:['cinematic lighting'],
      negative:['flat lighting'],
      bindings:[{kind:'lora',name:'Style/cinematic-v2.safetensors',strength:0.65,clipStrength:0.65}],
      parameters:{intensity:0.65},
    },
  };

  const restored=normalizePromptParts(JSON.parse(JSON.stringify([
    {type:'text',text:'portrait, '},
    content,
  ])));

  assert.deepEqual(restored,[{type:'text',text:'portrait, '},content]);
  assert.deepEqual(resolvePromptParts(restored),{
    text:'portrait, cinematic lighting',
    negative:'flat lighting',
    loras:[{name:'Style/cinematic-v2.safetensors',strength:0.65,clipStrength:0.65}],
    content:[content],
    workflowAugmentations:[],
  });
  assert.equal(restored[1].contentId,'style:cinematic');
  assert.notEqual(restored[1].contentId,restored[1].snapshot.bindings[0].name);
  assert.equal(contentPromptPart({
    type:'content',contentId:'concept:double-exposure',contentType:'Concept',name:'Двойная экспозиция',scope:'global',
    snapshot:{prompt:['double exposure'],negative:[],bindings:[],parameters:{}},
  }).contentType,'Concept');
});

test('prompt editor показывает semantic content, а не имя backend-файла', () => {
  const dom=new JSDOM('<textarea></textarea>'),textarea=dom.window.document.querySelector('textarea');
  const content={
    type:'content',contentId:'style:cinematic',contentType:'Style',name:'Кинематографический свет',scope:'global',
    snapshot:{prompt:['cinematic lighting'],negative:[],bindings:[{kind:'lora',name:'Style/private-file.safetensors',strength:0.65,clipStrength:0.65}],parameters:{intensity:0.65}},
  };
  const editor=createPromptEditor(textarea,{getLoras:()=>[{title:content.name,category:'Style',content}]});
  try{
    editor.write([content]);
    const token=editor.root.querySelector('.prompt-content');
    assert.equal(token.querySelector('.prompt-content-name').textContent,'Кинематографический свет');
    assert.doesNotMatch(token.textContent,/private-file|safetensors/i);
    assert.match(token.getAttribute('aria-label'),/Стиль.*Кинематографический свет.*0\.65/);
    assert.deepEqual(editor.read(),[content]);
    const remove=token.querySelector('.prompt-content-remove');
    assert.equal(remove.getAttribute('aria-label'),'Убрать стиль: Кинематографический свет');
    remove.click();
    assert.deepEqual(editor.read(),[]);
  }finally{editor.destroy();dom.window.close();}
});

test('workflow компилирует semantic content snapshot с отдельной силой модели и текста', () => {
  const content={
    type:'content',contentId:'effect:dream-glow',contentType:'Effect',name:'Мягкое свечение',scope:'global',
    snapshot:{
      prompt:['dreamy glow'],negative:['harsh shadows'],parameters:{intensity:0.7},
      bindings:[{kind:'lora',name:'Effects/glow.safetensors',strength:0.7,clipStrength:0.4}],
    },
  };
  const graph=compileWorkflow({
    recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:[{type:'text',text:'portrait, '},content],negative:'bad hands',
    seed:1,steps:20,cfg:5,sampler:'euler',scheduler:'normal',width:1024,height:1024,batchCount:1,
  });
  const loader=Object.values(graph).find(node=>node.class_type==='LoraLoader');
  assert.equal(loader.inputs.lora_name,'Effects/glow.safetensors');
  assert.equal(loader.inputs.strength_model,0.7);
  assert.equal(loader.inputs.strength_clip,0.4);
  assert.equal(graph['5'].inputs.text,'portrait, dreamy glow');
  assert.equal(graph['6'].inputs.text,'bad hands, harsh shadows');
});

test('неподключённая техническая реализация не имитирует успешную генерацию', () => {
  const pose={
    type:'content',contentId:'pose:openpose',contentType:'Pose',name:'Поза из референса',scope:'subject',subjectId:'lead',
    snapshot:{prompt:[],negative:[],parameters:{},bindings:[{kind:'control',name:'openpose',parameters:{strength:0.8}}]},
  };
  assert.throws(()=>compileWorkflow({
    recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:[pose],negative:'',seed:1,steps:20,cfg:5,
    sampler:'euler',scheduler:'normal',width:1024,height:1024,batchCount:1,
  }),/реализация.*control.*не подключена/i);
});

test('snapshot от другого recipe не применяет несовместимый backend молча', () => {
  const style={
    type:'content',contentId:'style:soft',contentType:'Style',name:'Мягкий стиль',scope:'global',
    snapshot:{prompt:['soft style'],negative:[],parameters:{},recipe:'anima',bindings:[{kind:'lora',name:'Style/Anima/soft.safetensors',strength:0.7,clipStrength:0.7}]},
  };
  assert.throws(()=>compileWorkflow({
    recipe:'checkpoint',checkpoint:'model.safetensors',positiveParts:[style],negative:'',seed:1,steps:20,cfg:5,
    sampler:'euler',scheduler:'normal',width:1024,height:1024,batchCount:1,
  }),/Мягкий стиль.*Anima.*текущей модель/i);
});
