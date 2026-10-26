import {comboValues} from './model_loader.js';

const modelFiles = {
  diffusion: ['UNETLoader','unet_name','qwen_image_2.1_int8_convrot.safetensors'],
  encoder: ['CLIPLoader','clip_name','qwen3vl_8b_int8_convrot.safetensors'],
  vae: ['VAELoader','vae_name','qwen_image_2.1_vae_bf16.safetensors'],
};
const coreNodes=['UNETLoader','CLIPLoader','VAELoader','QwenImage21Cache','LoadImage','TextEncodeQwenImage21','KSampler','VAEDecodeTiled','SaveImage'];
export const stabilityLoras={
  'outfit-swap':{label:'Outfit Swap',filename:'qwen-image-2.1-outfit-swap.safetensors'},
  consistency:{label:'Consistency',filename:'qwen-image-2.1-consistency.safetensors'},
};

export function editAvailability(info, local = false, stabilityLora = 'consistency') {
  if (!Object.hasOwn(stabilityLoras,stabilityLora)) return {available:false,reason:'Выберите LoRA стабильности: Outfit Swap или Consistency.',files:{}};
  const missing=coreNodes.filter(name => !info[name]);
  const files={};
  for (const [key,[node,field,basename]] of Object.entries(modelFiles)) {
    files[key]=comboValues(info[node]?.input?.required?.[field]).find(name => name.replaceAll('\\','/').split('/').at(-1)===basename);
    if (!files[key]) missing.push(basename);
  }
  if (!info.LoraLoaderModelOnly) missing.push('LoraLoaderModelOnly');
  files.lora=comboValues(info.LoraLoaderModelOnly?.input?.required?.lora_name).find(name => name.replaceAll('\\','/').split('/').at(-1)===stabilityLoras[stabilityLora].filename);
  if (!files.lora) missing.push(stabilityLoras[stabilityLora].filename);
  if (local) for (const name of ['LoadImageMask','InpaintCropImproved','InpaintStitchImproved','PrismEditSource','PrismEditRestore']) if (!info[name]) missing.push(name);
  return {available:missing.length===0, reason:missing.length ? `Для редактора недоступны: ${missing.join(', ')}` : '', files};
}

export function createEditSubmission(options, info) {
  const stabilityLora=options.stabilityLora ?? 'consistency';
  const availability=editAvailability(info,Boolean(options.maskImage),stabilityLora);
  if (!availability.available) throw new Error(availability.reason);
  if (typeof options.sourceImage!=='string' || !options.sourceImage.trim()) throw new Error('Загрузите исходное фото.');
  const prompt=String(options.prompt ?? '').trim();
  if (!prompt) throw new Error('Напишите, что изменить на изображении.');
  const draft=options.quality==='draft';
  const steps=options.steps ?? (draft ? 8 : 25);
  const seed=options.seed ?? Math.floor(Math.random()*10000000000);
  if (!Number.isSafeInteger(seed) || seed<0) throw new Error('Seed должен быть целым неотрицательным числом.');
  if (!Number.isInteger(steps) || steps<1 || steps>50) throw new Error('Выберите от 1 до 50 шагов.');
  const settings={operation:'image-edit',recipe:'qwen-image-2.1',checkpoint:availability.files.diffusion,clipName:availability.files.encoder,vaeName:availability.files.vae,positive:prompt,negative:'',editSourceImage:options.sourceImage,referenceImage:options.referenceImage ?? '',maskImage:options.maskImage ?? '',quality:draft?'draft':'standard',resolution:draft?512:1024,steps,seed,cfg:1,sampler:'euler',scheduler:'simple',batchCount:1};
  settings.stabilityLora=stabilityLora;
  settings.editLora={name:availability.files.lora,strength:1};
  // Журнал галереи связывает только сохранённые output-арты; загруженные фото остаются входами редактора.
  if (settings.editSourceImage.endsWith(' [output]')) {
    const path=settings.editSourceImage.replace(/ \[output\]$/,'').replaceAll('\\','/');
    const split=path.lastIndexOf('/');
    settings.sourceImage={filename:path.slice(split+1),subfolder:split<0?'':path.slice(0,split),type:'output'};
  }
  const workflow={
    '1':{class_type:'UNETLoader',inputs:{unet_name:settings.checkpoint,weight_dtype:'default'}},
    '2':{class_type:'CLIPLoader',inputs:{clip_name:settings.clipName,type:'qwen_image',device:'default'}},
    '3':{class_type:'VAELoader',inputs:{vae_name:settings.vaeName}},
    '4':{class_type:'QwenImage21Cache',inputs:{model:['16',0],device:'cpu',dtype:'int8'}},
    '16':{class_type:'LoraLoaderModelOnly',inputs:{model:['1',0],lora_name:settings.editLora.name,strength_model:settings.editLora.strength}},
    '5':{class_type:'LoadImage',inputs:{image:settings.editSourceImage}},
    '7':{class_type:'TextEncodeQwenImage21',inputs:{clip:['2',0],vae:['3',0],prompt,negative_prompt:'',resolution:settings.resolution,'images.image_1':['5',0]}},
    '8':{class_type:'KSampler',inputs:{model:['4',0],positive:['7',0],negative:['7',1],latent_image:['7',2],seed,steps,cfg:1,sampler_name:'euler',scheduler:'simple',denoise:1}},
    '9':{class_type:'VAEDecodeTiled',inputs:{samples:['8',0],vae:['3',0],tile_size:512,overlap:64,temporal_size:64,temporal_overlap:8}},
    '10':{class_type:'SaveImage',inputs:{images:['9',0],filename_prefix:'Prism/Edit'}},
  };
  if (settings.referenceImage) {
    workflow['6']={class_type:'LoadImage',inputs:{image:settings.referenceImage}};
    workflow['7'].inputs['images.image_2']=['6',0];
  }
  if (settings.maskImage) {
    const crop={};
    for (const [name,field] of Object.entries(info.InpaintCropImproved.input.required)) {
      if (Object.hasOwn(field[1] ?? {},'default')) crop[name]=field[1].default;
      else if (Array.isArray(field[0])) crop[name]=field[0][0];
    }
    const size=draft?512:768;
    Object.assign(crop,{image:['14',0],mask:['14',1],preresize:false,mask_blend_pixels:16,output_target_width:size,output_target_height:size});
    workflow['11']={class_type:'LoadImageMask',inputs:{image:settings.maskImage,channel:'red'}};
    workflow['12']={class_type:'InpaintCropImproved',inputs:crop};
    workflow['13']={class_type:'InpaintStitchImproved',inputs:{stitcher:['12',0],inpainted_image:['9',0]}};
    workflow['14']={class_type:'PrismEditSource',inputs:{image:['5',0],mask:['11',0]}};
    workflow['15']={class_type:'PrismEditRestore',inputs:{original:['14',2],edited:['13',0],blend_pixels:16}};
    workflow['7'].inputs['images.image_1']=['12',1];
    workflow['7'].inputs.resolution=size;
    settings.resolution=size;
    workflow['10'].inputs.images=['15',0];
  }
  return {settings,workflow};
}
