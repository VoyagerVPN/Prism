export function loadModel(graph, params) {
  if (['anima','qwen-image-2.1'].includes(params.recipe)) {
    graph["1"] = {
      "class_type": "UNETLoader",
      "inputs": { "unet_name": params.checkpoint, "weight_dtype": "default" }
    };
    graph["2"] = {
      "class_type": "CLIPLoader",
      "inputs": { "clip_name": params.clipName, "type": params.recipe==='qwen-image-2.1'?'qwen_image':'stable_diffusion' }
    };
    graph["3"] = {
      "class_type": "VAELoader",
      "inputs": { "vae_name": params.vaeName }
    };
    if(params.recipe==='qwen-image-2.1') {
      graph.qwen_cache={class_type:'QwenImage21Cache',inputs:{model:['1',0],device:'cpu',dtype:'int8'}};
    }
    return { modelLink: [params.recipe==='qwen-image-2.1'?'qwen_cache':'1', 0], clipLink: ["2", 0], vaeLink: ["3", 0] };
  }
  if (params.recipe !== 'checkpoint') throw new Error('Неподдерживаемый рецепт модели.');
    graph["1"] = {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": params.checkpoint
      }
    };
    
    let modelLink = ["1", 0];
    let clipLink = ["1", 1];
    let vaeLink = ["1", 2];

    if (params.advancedVaeEnabled && params.vae && params.vae !== "None") {
      graph["30"] = {
        "class_type": "VAELoader",
        "inputs": {
          "vae_name": params.vae
        }
      };
      vaeLink = ["30", 0];
    }

    return { modelLink, clipLink, vaeLink };
}

export function comboValues(field) {
  if (field?.[0] === 'COMBO' && Array.isArray(field[1]?.options)) return field[1].options;
  if (Array.isArray(field?.[0])) return field[0];
  if (Array.isArray(field?.[0]?.value)) return field[0].value;
  return [];
}

export function buildModelCatalog(info) {
  const checkpoints = comboValues(info.CheckpointLoaderSimple?.input.required.ckpt_name)
    .map(name => ({ name, recipe: 'checkpoint' }));
  const clips = comboValues(info.CLIPLoader?.input.required.clip_name);
  const vaes = comboValues(info.VAELoader?.input.required.vae_name);
  const clipName = 'qwen_3_06b_base.safetensors';
  const vaeName = 'qwen_image_vae.safetensors';
  const anima = info.CLIPLoader && info.VAELoader ? comboValues(info.UNETLoader?.input.required.unet_name)
    .filter(name => /^anima(?:[-_.]|$)/i.test(name.split(/[\\/]/).at(-1)))
    .map(name => {
      const missing = [!clips.includes(clipName) && clipName, !vaes.includes(vaeName) && vaeName].filter(Boolean);
      return { name, recipe: 'anima', clipName, vaeName, ...(missing.length ? { reason: `Нет компонентов Anima: ${missing.join(', ')}` } : {}) };
    }) : [];
  const basename=name=>name.replaceAll('\\','/').split('/').at(-1);
  const qwenClip=clips.find(name=>basename(name)==='qwen3vl_8b_int8_convrot.safetensors');
  const qwenVae=vaes.find(name=>basename(name)==='qwen_image_2.1_vae_bf16.safetensors');
  const qwen=comboValues(info.UNETLoader?.input.required.unet_name)
    .filter(name=>basename(name)==='qwen_image_2.1_int8_convrot.safetensors')
    .map(name=>{
      const missing=[!qwenClip&&'qwen3vl_8b_int8_convrot.safetensors',!qwenVae&&'qwen_image_2.1_vae_bf16.safetensors',...['TextEncodeQwenImage21','QwenImage21Cache','EmptyLatentImage','VAEDecodeTiled'].filter(node=>!info[node])].filter(Boolean);
      return {name,recipe:'qwen-image-2.1',clipName:qwenClip,vaeName:qwenVae,...(missing.length?{reason:`Нет компонентов Qwen 2.1: ${missing.join(', ')}`}:{})};
    });
  return [...checkpoints, ...anima,...qwen];
}

export function resolveModelSelection(catalog, name) {
  const entry = catalog.find(model => model.name === name);
  if (!entry || entry.reason) throw new Error(entry?.reason ?? `Модель ${name} недоступна.`);
  const selection = { checkpoint: entry.name, recipe: entry.recipe };
  if (entry.clipName) selection.clipName = entry.clipName;
  if (entry.vaeName) selection.vaeName = entry.vaeName;
  if (entry.recipe === 'anima') selection.recommended = { steps: 30, cfg: 4, sampler: 'er_sde', scheduler: 'simple' };
  if (entry.recipe === 'qwen-image-2.1') selection.recommended = {steps:25,cfg:1,sampler:'euler',scheduler:'simple'};
  return selection;
}

function loraFamily(baseModel) {
  if (typeof baseModel !== 'string' || !baseModel.trim() || /^unknown$/i.test(baseModel)) return 'unknown';
  if(/qwen.*2[._ -]?1/i.test(baseModel))return 'qwen-image-2.1';
  return /anima/i.test(baseModel) ? 'anima' : 'other';
}

export function assertLoraCompatibility(recipe, loras, details) {
  for (const lora of loras ?? []) {
    if (!lora?.name || lora.name === 'None') continue;
    const key = lora.name.replaceAll('\\', '/');
    const metadata = details?.[key] ?? details?.[lora.name];
    const family = loraFamily(metadata?.base_model);
    if(recipe==='qwen-image-2.1' && !['qwen-image-2.1','unknown'].includes(family))throw new Error(`LoRA «${lora.name}» несовместима с Qwen Image 2.1. Нужна LoRA именно для версии 2.1.`);
    if(recipe!=='qwen-image-2.1' && family==='qwen-image-2.1')throw new Error(`LoRA «${lora.name}» предназначена только для Qwen Image 2.1.`);
    if (recipe === 'anima' && family === 'other') {
      throw new Error(`LoRA «${lora.name}» несовместима с Anima. Выберите LoRA для Anima или смените модель.`);
    }
    if (recipe !== 'anima' && family === 'anima') {
      throw new Error(`LoRA «${lora.name}» предназначена только для Anima. Выберите совместимую LoRA или смените модель.`);
    }
  }
}

export function validateCapabilities(graph, info) {
  for (const [id, node] of Object.entries(graph)) {
    const schema = info[node.class_type];
    if (!schema) throw new Error(`Недоступен узел ${node.class_type}. Проверьте загрузку расширения в ComfyUI.`);
    for (const [name, field] of Object.entries(schema.input?.required ?? {})) {
      if (field[0] === 'COMFY_AUTOGROW_V3') {
        const template=field[1]?.template;
        const count=(template?.names ?? []).filter(slot => node.inputs[`${name}.${slot}`] !== undefined).length;
        if(count < (template?.min ?? 0)) throw new Error(`${node.class_type}: недостаточно входов ${name}.`);
        continue;
      }
      if (node.inputs[name] === undefined || node.inputs[name] === null) throw new Error(`${node.class_type}: отсутствует ${name}.`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      let field = schema.input?.required?.[name] ?? schema.input?.optional?.[name];
      if (!field && name.includes('.')) {
        // Штатный Autogrow сериализует отдельные слоты как images.image_1.
        const [root,slot]=name.split('.');
        const group=schema.input?.required?.[root] ?? schema.input?.optional?.[root];
        const template=group?.[1]?.template;
        if(group?.[0]==='COMFY_AUTOGROW_V3' && template?.names?.includes(slot)) {
          const fields=Object.values(template.input?.required ?? {});
          if(fields.length===1)field=fields[0];
        }
      }
      if (!field) throw new Error(`${node.class_type}: вход ${name} не поддерживается этой версией ComfyUI.`);
      if (Array.isArray(value)) {
        const source = graph[value[0]];
        const outputType = info[source?.class_type]?.output?.[value[1]];
        if (!source || !outputType) throw new Error(`Некорректная связь ${id}.${name}.`);
        if (typeof field[0] === 'string' && field[0] !== '*' && !field[0].split(',').includes(outputType)) {
          throw new Error(`${id}.${name}: ожидается ${field[0]}, получен ${outputType}.`);
        }
      } else if ((Array.isArray(field[0]) || field[0] === 'COMBO') && !(['LoadImage','LoadImageMask'].includes(node.class_type) && name === 'image') && !field[1]?.remote?.route) {
        // Загруженные файлы и remote-COMBO проверяет сервер: их значения появляются после снимка object_info.
        const normalized = item => typeof item === 'string' ? item.replaceAll('\\', '/') : item;
        if (!comboValues(field).some(item => normalized(item) === normalized(value))) throw new Error(`${node.class_type}: недоступно ${name} = ${value}.`);
      } else if (field[0] === 'INT' || field[0] === 'FLOAT') {
        if (!Number.isFinite(value) || (field[0] === 'INT' && !Number.isSafeInteger(value)) || value < (field[1]?.min ?? -Infinity) || value > (field[1]?.max ?? Infinity)) {
          throw new Error(`${node.class_type}: недопустимое значение ${name} = ${value}.`);
        }
      }
    }
  }
}
