export const batchSizes = [1,4,9];

export function frameSettings(settings, index) {
  if (!Number.isInteger(index) || index < 0 || index >= (settings.batchCount ?? 1)) throw new Error('Некорректный номер кадра');
  const offset = (seed, amount) => {
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Некорректный seed кадра');
    return Number((BigInt(seed)+BigInt(amount)) % (BigInt(Number.MAX_SAFE_INTEGER)+1n));
  };
  const variation = settings.variationStrength > 0;
  const seed = offset(settings.seed,variation ? 0 : index);
  const variationSeed = variation ? offset(settings.variationSeed,index) : settings.variationSeed;
  return {...settings,seed,seedInput:String(seed),seedMode:'lock',variationSeed,
    ...(variation ? {variationSeedInput:String(variationSeed)} : {}),
    batchCount:1,t2iBatchCount:1,i2iBatchCount:1,batchLayout:'square-v1'};
}

export function syncBatchControls() {
  for (const id of ['batch-count','i2i-batch-count']) {
    const input = document.getElementById(id);
    const count = batchSizes[Number(input.value)];
    document.getElementById(`${id}-label`).textContent = count === 1 ? '1 изображение' : `${count} изображений · ${Math.sqrt(count)}×${Math.sqrt(count)}`;
    input.setAttribute('aria-valuetext',`${count} изображений`);
  }
}

export async function gridImage(urls) {
  const images = await Promise.all(urls.map(async url => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }));
  const columns = Math.ceil(Math.sqrt(images.length)), rows = Math.ceil(images.length/columns);
  const cellWidth = Math.max(...images.map(image => image.naturalWidth));
  const cellHeight = Math.max(...images.map(image => image.naturalHeight));
  const width = columns*cellWidth, height = rows*cellHeight;
  // ponytail: ограничиваем память canvas; исходные кадры остаются в полном разрешении.
  const scale = Math.min(1,8192/Math.max(width,height),Math.sqrt(32000000/(width*height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1,Math.floor(width*scale));
  canvas.height = Math.max(1,Math.floor(height*scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог создать изображение сетки');
  context.fillStyle = '#101114'; context.fillRect(0,0,canvas.width,canvas.height);
  images.forEach((image,index) => {
    const fit = Math.min(cellWidth/image.naturalWidth,cellHeight/image.naturalHeight)*scale;
    const w = image.naturalWidth*fit, h = image.naturalHeight*fit;
    context.drawImage(image,(index%columns+.5)*cellWidth*scale-w/2,(Math.floor(index/columns)+.5)*cellHeight*scale-h/2,w,h);
  });
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось собрать PNG сетки')),'image/png'));
}
