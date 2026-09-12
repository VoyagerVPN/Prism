import { loadModel } from './model_loader.js';
import {batchSizes,frameSettings} from './batch.js';
import { normalizePromptParts, resolvePromptParts, loraKey } from './prompt_parts.js';

function numeric(value, fallback, label, min, max, integer = false) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isSafeInteger(n))) {
    throw new Error(`Некорректное значение «${label}»: ${value}`);
  }
  return n;
}

function outputImagePath(source) {
  if (!source || (source.type ?? 'output') !== 'output' || typeof source.filename !== 'string' || !source.filename) {
    throw new Error('Refine доступен только для сохранённого output-изображения.');
  }
  const path = [source.subfolder, source.filename].filter(Boolean).join('/').replaceAll('\\', '/');
  if (path.startsWith('/') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '')) {
    throw new Error('Некорректный путь исходного изображения.');
  }
  return `${path} [output]`;
}

function connectedWorkflow(graph, outputId) {
  const connected = new Set();
  const visit = id => {
    if (connected.has(id) || !Object.hasOwn(graph, id)) return;
    connected.add(id);
    for (const value of Object.values(graph[id].inputs)) {
      if (Array.isArray(value) && typeof value[0] === 'string') visit(value[0]);
    }
  };
  visit(outputId);
  return Object.fromEntries(Object.entries(graph).filter(([id]) => connected.has(id)));
}

// Refine повторяет только второй Hires-проход над уже сохранённым кадром.
export function compileRefineWorkflow(settings, source) {
  const width = numeric(source?.width, 0, 'Ширина исходника', 16, 16384, true);
  const height = numeric(source?.height, 0, 'Высота исходника', 16, 16384, true);
  const graph = compileWorkflow({
    ...settings,
    width,
    height,
    batchCount: 1,
    variationStrength: 0,
    hiresToggle: true,
    faceToggle: false,
    upscaleToggle: false,
    reactorToggle: false,
  });
  const upscale = Object.entries(graph).find(([, node]) => node.class_type === 'ImageUpscaleWithModel');
  const output = Object.entries(graph).find(([, node]) => node.class_type === 'SaveImage');
  if (!upscale || !output) throw new Error('Не удалось собрать Refine workflow.');
  const sourceNodeId = upscale[1].inputs.image?.[0];
  if (typeof sourceNodeId !== 'string' || !Object.hasOwn(graph, sourceNodeId)) throw new Error('В Hires workflow отсутствует исходное изображение.');
  graph[sourceNodeId] = { class_type: 'LoadImageOutput', inputs: { image: outputImagePath(source) } };
  return connectedWorkflow(graph, output[0]);
}

// Граф зависит только от снимка задания, а не от изменяемых полей интерфейса.
export function compileWorkflow(settings) {
  const count = settings.batchCount ?? 1;
  if (!batchSizes.includes(count)) throw new Error('Количество изображений: 1, 4 или 9');
  if (count > 1) {
    const result = {};
    for (let index = 0; index < count; index++) {
      const graph = compileWorkflow(frameSettings(settings,index));
      const prefix = `frame_${index}_`;
      for (const [id,node] of Object.entries(graph)) {
        result[prefix+id] = {...node,inputs:Object.fromEntries(Object.entries(node.inputs).map(([key,value]) =>
          [key,Array.isArray(value) && Object.hasOwn(graph,value[0]) ? [prefix+value[0],value[1]] : value]))};
      }
    }
    // Берём готовые кадры после всех обработок; размеры сетки равны сумме исходных пикселей.
    const frames = Array.from({length:count},(_,index)=>result[`frame_${index}_11`].inputs.images);
    let images = frames[0];
    for (let index = 1; index < count; index++) {
      const id = `grid_batch_${index}`;
      result[id] = {class_type:'ImageBatch',inputs:{image1:images,image2:frames[index]}};
      images = [id,0];
    }
    result.grid_size = {class_type:'GetImageSize',inputs:{image:frames[0]}};
    result.grid_image = {class_type:'ImageGrid',inputs:{images,columns:Math.sqrt(count),cell_width:['grid_size',0],cell_height:['grid_size',1],padding:0}};
    result.grid_save = {class_type:'SaveImage',inputs:{images:['grid_image',0],filename_prefix:`${settings.filenamePrefix ?? 'Dashboard'}_grid`}};
    return result;
  }
  const seed = numeric(settings.seed, 0, 'Seed', 0, Number.MAX_SAFE_INTEGER, true);
  const variationStrength = numeric(settings.variationStrength, 0, 'Вариация', 0, 1);
  const variationSeed = variationStrength > 0 ? numeric(settings.variationSeed, 0, 'Seed вариации', 0, Number.MAX_SAFE_INTEGER, true) : 0;
  const checkpointVal = settings.checkpoint;
  if (typeof checkpointVal !== 'string' || !checkpointVal) throw new Error('Выберите доступную модель.');
  const stepsValNum = numeric(settings.steps, 30, 'Steps', 1, 10000, true);
  const cfgValNum = numeric(settings.cfg, 6, 'CFG', 0, 100);
  const samplerVal = settings.sampler ?? 'euler';
  const schedulerVal = settings.scheduler ?? 'normal';
  const inline=settings.positiveParts===undefined?null:resolvePromptParts(normalizePromptParts(settings.positiveParts));
  const incompatibleContent=inline?.content.find(part=>part.snapshot.recipe&&part.snapshot.recipe!==settings.recipe);
  if(incompatibleContent){
    const labels={anima:'Anima',checkpoint:'checkpoint'};
    throw new Error(`«${incompatibleContent.name}» подготовлен для ${labels[incompatibleContent.snapshot.recipe]??incompatibleContent.snapshot.recipe} и несовместим с текущей моделью. Уберите и добавьте этот контент заново.`);
  }
  if(inline?.workflowAugmentations.length){
    const backend=inline.workflowAugmentations[0];
    throw new Error(`Техническая реализация ${backend.kind} для «${backend.contentId}» ещё не подключена к компилятору.`);
  }
  let positivePromptBase = inline?.text ?? settings.positive ?? '';
  let negativePromptBase = [settings.negative ?? '',inline?.negative ?? ''].filter(value=>value.trim()).join(', ');
  if (typeof positivePromptBase !== 'string' || typeof negativePromptBase !== 'string') throw new Error('Промпты должны быть текстом.');
  if (settings.recipe === 'anima' && /anima-aesthetic/i.test(checkpointVal)) {
    const missingQuality = ['masterpiece', 'best quality'].filter(tag => !new RegExp(`(?:^|,\\s*)${tag}(?:,|$)`, 'i').test(positivePromptBase));
    if (missingQuality.length) positivePromptBase = [...missingQuality, positivePromptBase.trim()].filter(Boolean).join(', ');
    if (!negativePromptBase.trim()) negativePromptBase = 'worst quality, low quality, blurry, jpeg artifacts, chromatic aberration';
  }
  const widthValNum = numeric(settings.width, 1024, 'Ширина', 16, 16384, true);
  const heightValNum = numeric(settings.height, 1024, 'Высота', 16, 16384, true);
  const clipSkipValNum = numeric(settings.clipSkip, 1, 'Clip skip', 1, 24, true);
  const vaeVal = settings.vae ?? 'None';
  const isHiresEnabled = settings.hiresToggle === true;
  const hiresScaleVal = numeric(settings.hiresScale, 1.5, 'Hires scale', 1, 4);
  const hiresDenoiseVal = numeric(settings.hiresDenoise, 0.4, 'Hires denoise', 0, 1);
  const isFaceEnabled = settings.faceToggle === true;
  const faceThresholdValNum = numeric(settings.faceThreshold, 0.5, 'Face threshold', 0, 1);
  const faceStepsValNum = numeric(settings.faceSteps, 20, 'Face steps', 1, 10000, true);
  const isUpscaleEnabled = settings.upscaleToggle === true;
  const upscaleModelVal = settings.upscaleSelect;
  const isReactorEnabled = settings.reactorToggle === true;
  const reactorDetectionVal = settings.reactorDetection ?? 'retinaface_resnet50';
  const reactorRestoreVal = settings.reactorRestore ?? 'none';
  const reactorVisibilityValNum = numeric(settings.reactorVisibility, 1, 'Face visibility', 0, 1);
  const reactorCodeformerWeightValNum = numeric(settings.reactorCodeformerWeight, 0.5, 'Codeformer weight', 0, 1);
  const reactorIndexSourceVal = settings.reactorIndexSource ?? '0';
  const reactorIndexInputVal = settings.reactorIndexInput ?? '0';
  const activeReactorImageName = settings.reactorImageName;
  if (isReactorEnabled && !activeReactorImageName) throw new Error('Для Face Swap нужен исходный файл лица.');
  if ((isHiresEnabled || isUpscaleEnabled) && !upscaleModelVal) throw new Error('Выберите доступную модель увеличения.');

  const graph = {};
  
  const loaderParams = {
    checkpoint: checkpointVal,
    vae: vaeVal,
    advancedVaeEnabled: settings.advancedToggle === true,
    recipe: settings.recipe,
    clipName: settings.clipName,
    vaeName: settings.vaeName
  };

  const { modelLink, clipLink, vaeLink } = loadModel(graph, loaderParams);
  
  let lastModelLink = modelLink;
  let lastClipLink = clipLink;
  let lastVaeLink = vaeLink;

  let nodeCounter = 100;

  const char = settings.promptVersion===2||settings.positiveParts?.some(part=>part.type==='character')?null:settings.character;
  const charLora = char?.lora && char.lora !== "None" && Number(char.strength ?? 1) !== 0 ? char.lora : null;
  const charLoraStrength = Number(char?.strength ?? 1);
  const selectedAppearance=char?.appearances?.[char.activeAppearanceName ?? 'По умолчанию'] ?? char?.appearance ?? '';
  const charAppearance = [char?.trigger,selectedAppearance].filter(Boolean).join(', ');
  const charOutfit = char?.outfits?.[char.activeOutfitName ?? "По умолчанию"] ?? char?.outfit ?? "";
  const charOutfitEnabled = char?.outfitEnabled ?? true;

  if (charLora) {
    const nodeId = `lora_${nodeCounter++}`;
    graph[nodeId] = {
      "class_type": "LoraLoader",
      "inputs": {
        "model": lastModelLink,
        "clip": lastClipLink,
        "lora_name": charLora,
        "strength_model": charLoraStrength,
        "strength_clip": charLoraStrength
      }
    };
    lastModelLink = [nodeId, 0];
    lastClipLink = [nodeId, 1];
  }

  const seenLoras=new Set(charLora?[loraKey(charLora)]:[]);
  const targetLoras = (inline?.loras??settings.loras??[]).filter(lora=>{const key=loraKey(lora.name||'');if(seenLoras.has(key))return false;seenLoras.add(key);return true;});
  targetLoras.forEach(lora => {
    if (lora.name && lora.name !== "None" && lora.strength !== 0) {
      const nodeId = `lora_${nodeCounter++}`;
      graph[nodeId] = {
        "class_type": "LoraLoader",
        "inputs": {
          "model": lastModelLink,
          "clip": lastClipLink,
          "lora_name": lora.name,
          "strength_model": parseFloat(lora.strength),
        "strength_clip": parseFloat(lora.clipStrength ?? lora.strength)
        }
      };
      lastModelLink = [nodeId, 0];
      lastClipLink = [nodeId, 1];
    }
  });

  if (settings.advancedToggle && settings.recipe === "checkpoint") {
    graph["clip_skip"] = {
      class_type: "CLIPSetLastLayer",
      inputs: { clip: lastClipLink, stop_at_clip_layer: -clipSkipValNum }
    };
    lastClipLink = ["clip_skip", 0];
  }

  let positivePrompt = positivePromptBase;
  
  if (charAppearance.trim()) {
    positivePrompt += (positivePrompt.trim() ? ", " : "") + charAppearance.trim();
  }
  if (charOutfit.trim() && charOutfitEnabled) {
    positivePrompt += (positivePrompt.trim() ? ", " : "") + charOutfit.trim();
  }

  const loraDescriptions = [];
  targetLoras.forEach(lora => {
    if (lora.name && lora.name !== "None" && lora.description && lora.description.trim()) {
      loraDescriptions.push(lora.description.trim());
    }
  });
  if (loraDescriptions.length > 0) {
    positivePrompt += (positivePrompt.trim() ? ", " : "") + loraDescriptions.join(", ");
  }

  graph["5"] = {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": lastClipLink,
      "text": positivePrompt
    }
  };

  graph["6"] = {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": lastClipLink,
      "text": negativePromptBase
    }
  };
  
  graph["4"] = {
    "class_type": "EmptyLatentImage",
    "inputs": {
      "width": widthValNum,
      "height": heightValNum,
      "batch_size": 1
    }
  };
  const lastLatentLink = ["4", 0];

  graph["7"] = {
    "class_type": "KSampler",
    "inputs": {
      "model": lastModelLink,
      "positive": ["5", 0],
      "negative": ["6", 0],
      "latent_image": lastLatentLink,
      "seed": seed,
            "steps": stepsValNum,
      "cfg": cfgValNum,
      "sampler_name": samplerVal,
      "scheduler": schedulerVal,
      "denoise": 1.0
    }
  };
  
  if (variationStrength > 0) {
    graph.variation_noise = {class_type:'PrismVariationNoise',inputs:{seed,variation_seed:variationSeed,strength:variationStrength}};
    graph.variation_guider = {class_type:'CFGGuider',inputs:{model:lastModelLink,positive:['5',0],negative:['6',0],cfg:cfgValNum}};
    graph.variation_sampler = {class_type:'KSamplerSelect',inputs:{sampler_name:samplerVal}};
    graph.variation_schedule = {class_type:'BasicScheduler',inputs:{model:lastModelLink,scheduler:schedulerVal,steps:stepsValNum,denoise:1.0}};
    graph['7'] = {class_type:'SamplerCustomAdvanced',inputs:{noise:['variation_noise',0],guider:['variation_guider',0],sampler:['variation_sampler',0],sigmas:['variation_schedule',0],latent_image:lastLatentLink}};
  }

  let lastLatentNode = "7";
  
  if (isHiresEnabled) {
    // 1. Decode latent to image
    graph["15"] = {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": [lastLatentNode, 0],
        "vae": lastVaeLink
      }
    };
    
    // 2. Load upscale model
    graph["31"] = {
      "class_type": "UpscaleModelLoader",
      "inputs": {
        "model_name": upscaleModelVal || "4x-UltraSharp.pth"
      }
    };
    
    // 3. Upscale image with model
    graph["32"] = {
      "class_type": "ImageUpscaleWithModel",
      "inputs": {
        "upscale_model": ["31", 0],
        "image": ["15", 0]
      }
    };
    
    // 4. Scale to target width/height (e.g. scaleFactor of original width/height)
    graph["33"] = {
      "class_type": "ImageScale",
      "inputs": {
        "image": ["32", 0],
        "width": Math.round(widthValNum * hiresScaleVal),
        "height": Math.round(heightValNum * hiresScaleVal),
        "upscale_method": "bicubic",
        "crop": "disabled"
      }
    };
    
    // 5. Encode image back to latent
    graph["34"] = {
      "class_type": "VAEEncode",
      "inputs": {
        "pixels": ["33", 0],
        "vae": lastVaeLink
      }
    };
    
    // 6. Run KSampler on upscaled latent
    graph["16"] = {
      "class_type": "KSampler",
      "inputs": {
        "model": lastModelLink,
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["34", 0],
        "seed": seed,
                "steps": stepsValNum,
        "cfg": cfgValNum,
        "sampler_name": samplerVal,
        "scheduler": schedulerVal,
        "denoise": hiresDenoiseVal
      }
    };
    
    lastLatentNode = "16";
  }
  
  graph["8"] = {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [lastLatentNode, 0],
      "vae": lastVaeLink
    }
  };
  
  let lastImageNode = "8";
  
  if (isReactorEnabled && activeReactorImageName) {
    graph["110"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": activeReactorImageName
      }
    };
    
    graph["111"] = {
      "class_type": "ReActorFaceSwap",
      "inputs": {
        "enabled": true,
        "swap_model": "inswapper_128.onnx",
        "facedetection": reactorDetectionVal,
        "face_restore_model": reactorRestoreVal,
        "face_restore_visibility": reactorVisibilityValNum,
        "codeformer_weight": reactorCodeformerWeightValNum,
        "detect_gender_input": "no",
        "detect_gender_source": "no",
        "input_faces_index": reactorIndexInputVal || "0",
        "source_faces_index": reactorIndexSourceVal || "0",
        "console_log_level": 1,
        "input_image": [lastImageNode, 0],
        "source_image": ["110", 0]
      }
    };
    
    lastImageNode = "111";
  }
  
  if (isFaceEnabled) {
    const faceCfg = settings.recipe === 'anima' ? cfgValNum : 6.0;
    const faceSampler = settings.recipe === 'anima' ? samplerVal : 'dpmpp_2m';
    const faceScheduler = settings.recipe === 'anima' ? schedulerVal : 'karras';
    graph["9"] = {
      "class_type": "UltralyticsDetectorProvider",
      "inputs": {
        "model_name": "bbox/face_yolov8m.pt"
      }
    };
    
    graph["10"] = {
      "class_type": "FaceDetailer",
      "inputs": {
        "image": [lastImageNode, 0],
        "model": lastModelLink,
        "clip": lastClipLink,
        "vae": lastVaeLink,
        "guide_size": 512,
        "guide_size_for": true,
        "max_size": 1024,
        "seed": seed,
                "steps": faceStepsValNum,
        "cfg": faceCfg,
        "sampler_name": faceSampler,
        "scheduler": faceScheduler,
        "denoise": 0.35,
        "feather": 5,
        "noise_mask": true,
        "force_inpaint": true,
        "bbox_threshold": faceThresholdValNum,
        "bbox_dilation": 10,
        "bbox_crop_factor": 3.0,
        "sam_detection_hint": "center-1",
        "sam_dilation": 0,
        "sam_threshold": 0.93,
        "sam_bbox_expansion": 0,
        "sam_mask_hint_threshold": 0.7,
        "sam_mask_hint_use_negative": "False",
        "drop_size": 10,
        "wildcard": "",
        "cycle": 1,
        "bbox_detector": ["9", 0],
        "positive": ["5", 0],
        "negative": ["6", 0]
      }
    };
    
    lastImageNode = "10";
  }
  
  if (isUpscaleEnabled) {
    graph["13"] = {
      "class_type": "UpscaleModelLoader",
      "inputs": {
        "model_name": upscaleModelVal
      }
    };
    
    graph["14"] = {
      "class_type": "ImageUpscaleWithModel",
      "inputs": {
        "upscale_model": ["13", 0],
        "image": [lastImageNode, 0]
      }
    };
    
    lastImageNode = "14";
  }
  
  graph["11"] = {
    "class_type": "SaveImage",
    "inputs": {
      "images": [lastImageNode, 0],
      "filename_prefix": settings.filenamePrefix ?? "Dashboard"
    }
  };
  
  return graph;
}
