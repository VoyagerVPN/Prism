const GIB = 1024 ** 3;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function gib(value, unit = true, english = false) {
  const fixed = (number(value) / GIB).toFixed(1);
  const formatted = english ? fixed : fixed.replace('.', ',');
  return unit ? `${formatted} ${english?'GB':'ГБ'}` : formatted;
}

function percent(used, capacity) {
  return capacity > 0 ? Math.max(0, Math.min(100, used / capacity * 100)) : 0;
}

export function presentResourceMetrics(metrics, localization = null) {
  const english=localization?.language==='en';
  const fmt=(value,unit=true)=>gib(value,unit,english);
  const tr=(key,fallback,values={})=>english?localization.t(`metrics.${key}`,{...values,defaultValue:fallback,interpolation:{escapeValue:false}}):fallback;
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
      value: ramCapacity ? fmt(ramUsed) : '—',
      detail: tr('ramDetail','RSS процесса'),
      percent: percent(ramUsed, ramCapacity),
      title: ramCapacity ? tr('ramTitle',`Prism/ComfyUI, PID ${pid}: RSS процесса ${fmt(ramUsed)} из ${fmt(ramCapacity)} системной RAM.`,{pid,used:fmt(ramUsed),capacity:fmt(ramCapacity)}) : tr('ramUnavailable','Метрика RAM процесса недоступна.'),
    },
    vram: {
      value: vramCapacity ? `${vram.estimated ? '≈' : ''}${fmt(vramUsed)}` : '—',
      detail: vramCapacity ? tr('vramDetail',`модели ${fmt(models, false)} · работа ${fmt(working, false)} · кэш ${fmt(cache)}`,{models:fmt(models,false),working:fmt(working,false),cache:fmt(cache)}) : tr('noData','PyTorch: нет данных'),
      percent: percent(vramUsed, vramCapacity),
      modelPercent: percent(models, vramCapacity),
      workingPercent: percent(working, vramCapacity),
      cachePercent: percent(cache, vramCapacity),
      title: vramCapacity
        ? tr('vramTitle',`Prism/ComfyUI на ${device.name ?? 'GPU'}: ${vram.estimated ? 'оценка ' : ''}${fmt(vramUsed)} из ${fmt(vramCapacity)} по данным менеджера моделей Comfy и PyTorch. Модели ${fmt(models)}, рабочие тензоры ${fmt(working)}, резерв кэша ${fmt(cache)}. Память сторонних CUDA-библиотек в эту метрику не входит.`,{device:device.name??'GPU',estimate:vram.estimated?tr('estimate','оценка '):'',used:fmt(vramUsed),capacity:fmt(vramCapacity),models:fmt(models),working:fmt(working),cache:fmt(cache)})
        : tr('vramUnavailable','Метрика VRAM процесса недоступна.'),
    },
  };
}
