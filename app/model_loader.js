export function loadModel(graph, params) {
  if (params.recipe === 'anima') {
    graph["1"] = {
      "class_type": "UNETLoader",
      "inputs": { "unet_name": params.checkpoint, "weight_dtype": "default" }
    };
    graph["2"] = {
      "class_type": "CLIPLoader",
      "inputs": { "clip_name": params.clipName, "type": "stable_diffusion" }
    };
    graph["3"] = {
      "class_type": "VAELoader",
      "inputs": { "vae_name": params.vaeName }
    };
    return { modelLink: ["1", 0], clipLink: ["2", 0], vaeLink: ["3", 0] };
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
  return [...checkpoints, ...anima];
}

export function resolveModelSelection(catalog, name) {
  const entry = catalog.find(model => model.name === name);
  if (!entry || entry.reason) throw new Error(entry?.reason ?? `Модель ${name} недоступна.`);
  const selection = { checkpoint: entry.name, recipe: entry.recipe };
  if (entry.clipName) selection.clipName = entry.clipName;
  if (entry.vaeName) selection.vaeName = entry.vaeName;
  if (entry.recipe === 'anima') selection.recommended = { steps: 30, cfg: 4, sampler: 'er_sde', scheduler: 'simple' };
  return selection;
}

function loraFamily(baseModel) {
  if (typeof baseModel !== 'string' || !baseModel.trim() || /^unknown$/i.test(baseModel)) return 'unknown';
  return /anima/i.test(baseModel) ? 'anima' : 'other';
}

export function assertLoraCompatibility(recipe, loras, details) {
  for (const lora of loras ?? []) {
    if (!lora?.name || lora.name === 'None') continue;
    const key = lora.name.replaceAll('\\', '/');
    const metadata = details?.[key] ?? details?.[lora.name];
    const family = loraFamily(metadata?.base_model);
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
      if (node.inputs[name] === undefined || node.inputs[name] === null) throw new Error(`${node.class_type}: отсутствует ${name}.`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const field = schema.input?.required?.[name] ?? schema.input?.optional?.[name];
      if (!field) throw new Error(`${node.class_type}: вход ${name} не поддерживается этой версией ComfyUI.`);
      if (Array.isArray(value)) {
        const source = graph[value[0]];
        const outputType = info[source?.class_type]?.output?.[value[1]];
        if (!source || !outputType) throw new Error(`Некорректная связь ${id}.${name}.`);
        if (typeof field[0] === 'string' && field[0] !== '*' && !field[0].split(',').includes(outputType)) {
          throw new Error(`${id}.${name}: ожидается ${field[0]}, получен ${outputType}.`);
        }
      } else if ((Array.isArray(field[0]) || field[0] === 'COMBO') && !(node.class_type === 'LoadImage' && name === 'image') && !field[1]?.remote?.route) {
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
