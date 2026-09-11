const samplingClasses = new Set([
  'KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'SamplerCustomAdvanced', 'FaceDetailer',
]);

const stageNames = {
  CheckpointLoaderSimple: 'Загрузка модели',
  UNETLoader: 'Загрузка модели',
  CLIPLoader: 'Загрузка текстовой модели',
  DualCLIPLoader: 'Загрузка текстовой модели',
  VAELoader: 'Загрузка VAE',
  LoraLoader: 'Применение LoRA',
  CLIPTextEncode: 'Подготовка промпта',
  EmptyLatentImage: 'Подготовка латента',
  KSampler: 'Диффузия',
  KSamplerAdvanced: 'Диффузия',
  SamplerCustom: 'Диффузия',
  SamplerCustomAdvanced: 'Диффузия',
  VAEDecode: 'Декодирование',
  VAEEncode: 'Кодирование Hires',
  UpscaleModelLoader: 'Загрузка апскейлера',
  ImageUpscaleWithModel: 'Нейросетевое увеличение',
  ImageScale: 'Масштабирование',
  FaceDetailer: 'Детализация лица',
  ReActorFaceSwap: 'Замена лица',
  SaveImage: 'Сохранение изображения',
  ImageBatch: 'Сборка серии',
  ImageGrid: 'Сборка сетки',
  GetImageSize: 'Подготовка сетки',
  LoadImage: 'Загрузка изображения',
  LoadImageOutput: 'Загрузка исходника',
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function samplerSteps(node, workflow) {
  let steps = finite(node?.inputs?.steps);
  if (!steps && Array.isArray(node?.inputs?.sigmas)) {
    steps = finite(workflow?.[String(node.inputs.sigmas[0])]?.inputs?.steps);
  }
  const denoise = Math.max(0.05, Math.min(1, finite(node?.inputs?.denoise, 1)));
  return Math.max(1, steps ? steps * denoise : 8);
}

function nodeWeight(node, workflow) {
  if (!node || typeof node.class_type !== 'string') return 1;
  if (samplingClasses.has(node.class_type)) return samplerSteps(node, workflow);
  if (['CheckpointLoaderSimple', 'UNETLoader', 'CLIPLoader', 'DualCLIPLoader', 'VAELoader', 'UpscaleModelLoader'].includes(node.class_type)) return 6;
  if (node.class_type === 'LoraLoader') return 3;
  if (node.class_type === 'ImageUpscaleWithModel') return 8;
  if (['VAEDecode', 'VAEEncode', 'ReActorFaceSwap'].includes(node.class_type)) return 4;
  if (node.class_type === 'ImageScale') return 2;
  if (node.class_type === 'SaveImage') return 2;
  return 1;
}

function progressPlan(workflow) {
  const entries = Object.entries(workflow ?? {}).filter(([, node]) => node && typeof node === 'object');
  const weights = Object.fromEntries(entries.map(([id, node]) => [id, nodeWeight(node, workflow)]));
  return {
    weights,
    total: Math.max(1, Object.values(weights).reduce((sum, weight) => sum + weight, 0)),
    sampling: entries.filter(([, node]) => samplingClasses.has(node.class_type)).map(([id]) => id),
  };
}

export function createProgress() {
  return {
    version: 1,
    completedNodes: [],
    activeNode: null,
    value: 0,
    max: 0,
    percent: 0,
  };
}

function normalizedProgress(progress) {
  return {
    ...createProgress(),
    ...(progress && typeof progress === 'object' ? progress : {}),
    completedNodes: Array.isArray(progress?.completedNodes) ? [...new Set(progress.completedNodes.map(String))] : [],
    activeNode: progress?.activeNode === null || progress?.activeNode === undefined ? null : String(progress.activeNode),
    value: Math.max(0, finite(progress?.value)),
    max: Math.max(0, finite(progress?.max)),
    percent: Math.max(0, Math.min(100, finite(progress?.percent))),
  };
}

function recalculate(progress, workflow, complete = false) {
  const plan = progressPlan(workflow);
  const completed = new Set(progress.completedNodes.filter(id => Object.hasOwn(plan.weights, id)));
  let done = [...completed].reduce((sum, id) => sum + plan.weights[id], 0);
  if (progress.activeNode && !completed.has(progress.activeNode)) {
    const ratio = progress.max > 0 ? Math.min(1, progress.value / progress.max) : 0;
    done += (plan.weights[progress.activeNode] ?? 1) * ratio;
  }
  const calculated = complete ? 100 : Math.min(99, Math.round(done / plan.total * 100));
  progress.percent = complete ? 100 : Math.max(progress.percent, calculated);
  return progress;
}

function enterNode(progress, workflow, nodeId) {
  if (!nodeId || !Object.hasOwn(workflow ?? {}, nodeId)) return progress;
  if (progress.activeNode && progress.activeNode !== nodeId && !progress.completedNodes.includes(progress.activeNode)) {
    progress.completedNodes.push(progress.activeNode);
  }
  if (progress.activeNode !== nodeId) {
    progress.activeNode = nodeId;
    progress.value = 0;
    progress.max = 0;
  }
  return progress;
}

export function advanceProgress(current, workflow, type, data = {}) {
  if (type === 'execution_start') return createProgress(workflow);
  const progress = normalizedProgress(current);
  if (type === 'execution_cached') {
    for (const id of Array.isArray(data.nodes) ? data.nodes.map(String) : []) {
      if (Object.hasOwn(workflow ?? {}, id) && !progress.completedNodes.includes(id)) progress.completedNodes.push(id);
    }
  } else if (type === 'executing' && data.node !== null && data.node !== undefined) {
    enterNode(progress, workflow, String(data.node));
  } else if (type === 'progress' && data.node !== null && data.node !== undefined) {
    const nodeId = String(data.node);
    enterNode(progress, workflow, nodeId);
    const maximum = Math.max(0, finite(data.max));
    const value = Math.max(0, finite(data.value));
    if (maximum > 0) {
      const oldRatio = progress.max > 0 ? progress.value / progress.max : 0;
      const newRatio = value / maximum;
      if (newRatio >= oldRatio) {
        progress.value = value;
        progress.max = maximum;
      }
    }
  } else if (type === 'execution_success') {
    if (progress.activeNode && !progress.completedNodes.includes(progress.activeNode)) progress.completedNodes.push(progress.activeNode);
    progress.activeNode = null;
    progress.value = 0;
    progress.max = 0;
    return recalculate(progress, workflow, true);
  }
  return recalculate(progress, workflow);
}

export function describeProgress(current, workflow, settings = {}) {
  const progress = normalizedProgress(current);
  const nodeId = progress.activeNode;
  const node = nodeId ? workflow?.[nodeId] : null;
  if (!node) return {
    label: 'Выполняется',
    detail: `Общий прогресс ${Math.round(progress.percent)}% · Подготовка workflow`,
    percent: progress.percent,
  };

  const frame = /^frame_(\d+)_/.exec(nodeId);
  const frameCount = Math.max(1, finite(settings.batchCount, 1));
  const stage = stageNames[node.class_type] ?? node.class_type ?? 'Узел ComfyUI';
  const label = frame ? `Кадр ${Number(frame[1]) + 1}/${frameCount} · ${stage}` : stage;
  const parts = [`Общий прогресс ${Math.round(progress.percent)}%`];
  const plan = progressPlan(workflow);
  const passIndex = plan.sampling.indexOf(nodeId);
  if (passIndex >= 0) parts.push(`Проход ${passIndex + 1}/${plan.sampling.length}`);
  if (progress.max > 0) parts.push(`Шаг ${Math.min(progress.value, progress.max)}/${progress.max}`);
  return { label, detail: parts.join(' · '), percent: progress.percent };
}
