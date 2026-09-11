const GIB = 1024 ** 3;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function gib(value, unit = true) {
  const formatted = (number(value) / GIB).toFixed(1).replace('.', ',');
  return unit ? `${formatted} ГБ` : formatted;
}

function percent(used, capacity) {
  return capacity > 0 ? Math.max(0, Math.min(100, used / capacity * 100)) : 0;
}

export function presentResourceMetrics(metrics) {
  const ram = metrics?.process?.ram ?? {};
  const ramUsed = number(ram.used);
  const ramCapacity = number(ram.capacity);
  const pid = Number.isSafeInteger(metrics?.process?.pid) ? metrics.process.pid : '—';
  const device = metrics?.devices?.[0];
  const vram = device?.vram ?? {};
  const vramUsed = number(vram.used);
  const vramCapacity = number(vram.capacity);
  const models = number(vram.models);
  const working = number(vram.working);
  const cache = number(vram.cache);

  return {
    ram: {
      value: ramCapacity ? gib(ramUsed) : '—',
      detail: 'RSS процесса',
      percent: percent(ramUsed, ramCapacity),
      title: ramCapacity ? `Prism/ComfyUI, PID ${pid}: RSS процесса ${gib(ramUsed)} из ${gib(ramCapacity)} системной RAM.` : 'Метрика RAM процесса недоступна.',
    },
    vram: {
      value: vramCapacity ? `${vram.estimated ? '≈' : ''}${gib(vramUsed)}` : '—',
      detail: vramCapacity ? `модели ${gib(models, false)} · работа ${gib(working, false)} · кэш ${gib(cache)}` : 'PyTorch: нет данных',
      percent: percent(vramUsed, vramCapacity),
      modelPercent: percent(models, vramCapacity),
      workingPercent: percent(working, vramCapacity),
      cachePercent: percent(cache, vramCapacity),
      title: vramCapacity
        ? `Prism/ComfyUI на ${device.name ?? 'GPU'}: ${vram.estimated ? 'оценка ' : ''}${gib(vramUsed)} из ${gib(vramCapacity)} по данным менеджера моделей Comfy и PyTorch. Модели ${gib(models)}, рабочие тензоры ${gib(working)}, резерв кэша ${gib(cache)}. Память сторонних CUDA-библиотек в эту метрику не входит.`
        : 'Метрика VRAM процесса недоступна.',
    },
  };
}
