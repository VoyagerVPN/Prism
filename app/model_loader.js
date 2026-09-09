export function loadModel(graph, params) {
  if (params.recipe !== 'checkpoint') throw new Error('Текущий пайплайн поддерживает checkpoint-модели.');
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
  return comboValues(info.CheckpointLoaderSimple?.input.required.ckpt_name)
    .map(name => ({ name, recipe: 'checkpoint' }));
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
      } else if ((Array.isArray(field[0]) || field[0] === 'COMBO') && !(node.class_type === 'LoadImage' && name === 'image')) {
        // LoadImage проверяется сервером: только что загруженного файла ещё нет в снимке object_info.
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
