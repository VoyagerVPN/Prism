export const sameImage = (left, right) => left && right
  && left.filename === right.filename
  && (left.subfolder ?? '') === (right.subfolder ?? '')
  && (left.type ?? 'output') === (right.type ?? 'output');


export function imageFromUrl(value, baseUrl = globalThis.document?.baseURI ?? 'http://localhost/') {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, baseUrl);
    const filename = url.searchParams.get('filename');
    if (!filename) return null;
    return {
      filename,
      subfolder: url.searchParams.get('subfolder') ?? '',
      type: url.searchParams.get('type') ?? 'output',
    };
  } catch {
    return null;
  }
}


export function charactersFromSettings(settings) {
  const result = [];
  const seen = new Set();
  const add = character => {
    if (!character?.name) return;
    const value = {
      name: String(character.name),
      lora: String(character.lora ?? '').replaceAll('\\', '/'),
    };
    const key = `${value.name.toLocaleLowerCase()}\0${value.lora.toLocaleLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  };
  for (const part of settings?.positiveParts ?? []) {
    if (part?.type === 'character') add(part.character);
  }
  if (!result.length) add(settings?.character);
  return result;
}


export function selectedOutputImage(item, batchIndex = 0) {
  if (!item) return null;
  const gridOutput = item.gridOutput ?? imageFromUrl(item.gridUrl);
  const outputs = Array.isArray(item.outputs)
    ? item.outputs.filter(output => !sameImage(output, gridOutput))
    : [];
  const hasBatch = (item.batchUrls?.length ?? outputs.length) > 1;
  if (hasBatch && batchIndex === 0) return gridOutput;
  if (batchIndex > 0) return outputs[batchIndex - 1] ?? imageFromUrl(item.batchUrls?.[batchIndex - 1]);
  return outputs[0] ?? imageFromUrl(item.url);
}


export function generationFromHistory(item) {
  const settings = item?.settings ?? item ?? {};
  const gridOutput = item?.gridOutput ?? imageFromUrl(item?.gridUrl);
  let outputs = Array.isArray(item?.outputs)
    ? item.outputs.filter(output => !sameImage(output, gridOutput))
    : [];
  if (!outputs.length) {
    const urls = item?.batchUrls?.length ? item.batchUrls : [item?.url];
    outputs = urls.map(value => imageFromUrl(value)).filter(Boolean).filter(output => !sameImage(output, gridOutput));
  }
  return {
    promptId: item?.promptId ?? '',
    createdAt: item?.timestamp ?? Date.now(),
    characters: charactersFromSettings(settings),
    settings,
    workflow: item?.workflow ?? null,
    ...(Array.isArray(item?.sourceArtIds) ? {sourceArtIds: [...item.sourceArtIds]} : {}),
    outputs,
    gridOutput,
  };
}


function historyItem(operation, itemsById, imageToUrl) {
  const settings = structuredClone(operation.settings ?? {});
  const frames = (operation.outputArtIds ?? []).map(id => itemsById.get(id)?.image).filter(Boolean);
  const gridOutput = operation.gridArtId ? itemsById.get(operation.gridArtId)?.image ?? null : null;
  if (!frames.length && !gridOutput) return null;
  const frameUrls = frames.map(imageToUrl);
  const gridUrl = gridOutput ? imageToUrl(gridOutput) : null;
  return {
    ...settings,
    version: 4,
    operationId: operation.id,
    operation: operation.kind,
    sourceArtIds: [...(operation.sourceArtIds ?? [])],
    promptId: operation.promptId ?? '',
    settings,
    workflow: operation.workflow ? structuredClone(operation.workflow) : null,
    outputs: structuredClone(gridOutput ? [...frames, gridOutput] : frames),
    gridOutput: structuredClone(gridOutput),
    url: gridUrl ?? frameUrls[0],
    gridUrl,
    batchUrls: frames.length > 1 ? frameUrls : [],
    timestamp: operation.createdAt ?? 0,
    hires: settings.hiresToggle ? {scale: settings.hiresScale, denoise: settings.hiresDenoise} : null,
    face: settings.faceToggle ? {threshold: settings.faceThreshold, steps: settings.faceSteps} : null,
    upscale: settings.upscaleToggle ? {model: settings.upscaleSelect} : null,
    reactor: settings.reactorToggle ? {
      detection: settings.reactorDetection,
      restore: settings.reactorRestore,
      visibility: settings.reactorVisibility,
      codeformerWeight: settings.reactorCodeformerWeight,
      indexSource: settings.reactorIndexSource,
      indexInput: settings.reactorIndexInput,
      imageName: settings.reactorImageName,
    } : null,
  };
}


export function historyFromCatalog(snapshot, imageToUrl, limit = 15) {
  if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.operations)) return [];
  const itemsById = new Map(snapshot.items.map(item => [item.id, item]));
  return [...snapshot.operations]
    .filter(operation => operation?.status === 'succeeded')
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .map(operation => historyItem(operation, itemsById, imageToUrl))
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}
