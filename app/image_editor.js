import {imageUrl,uploadInputImage} from './api.js';
import {createEditSubmission,editAvailability,stabilityLoras} from './image_edit_workflow.js';

export function initImageEditor({uploadImage=uploadInputImage} = {}) {
  const get=id => document.getElementById(`edit-${id}`);
  const assets={source:null,reference:null};
  const urls=new Map();
  let result=null;
  let hasMask=false, erasing=false, painting=false, lastPoint=null;
  let storedMask='';
  const canvas=get('mask-canvas');
  const notify=() => window.dispatchEvent(new window.CustomEvent('editor-change'));
  const message=text => { get('message').textContent=text; };
  const displayName=name => name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,'');
  function selectImage(kind,file) {
    if (file && !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Выберите PNG, JPEG или WebP.');
    const previous=urls.get(kind);
    if (previous) URL.revokeObjectURL(previous);
    assets[kind]=file ? {file,name:file.name} : null;
    const url=file?URL.createObjectURL(file):'';
    urls.set(kind,url);
    get(`${kind}-preview`).src=url;
    get(`${kind}-preview`).hidden=!file;
    get(`${kind}-name`).textContent=file?.name ?? (kind==='source'?'Выберите или перетащите фото':'Выберите или перетащите картинку');
    get(`${kind}-clear`).hidden=!file;
    if (kind==='source') {
      result=null;hasMask=false;storedMask='';
      canvas.width=canvas.width;
      get('result-info').textContent='';
      get('show-result').disabled=true;get('use-result').disabled=true;get('download').hidden=true;
      get('stage-image').src=url;
      get('empty').hidden=Boolean(file);
      get('canvas-wrap').hidden=!file;
      compare(false);
    }
    message(''); notify();
  }
  function compare(showResult) {
    const active=showResult && Boolean(result);
    get('result-image').hidden=!active;
    get('canvas-wrap').hidden=active || !assets.source;
    get('show-source').setAttribute('aria-pressed',String(!active));
    get('show-result').setAttribute('aria-pressed',String(active));
  }
  for (const kind of ['source','reference']) {
    const input=get(`${kind}-file`),drop=input.closest('.edit-upload');
    input.addEventListener('change',() => { try { selectImage(kind,input.files[0] ?? null); } catch(error) { message(error.message); } });
    get(`${kind}-clear`).addEventListener('click',() => { input.value=''; selectImage(kind,null); });
    drop.addEventListener('dragover',event => { event.preventDefault(); drop.classList.add('file-over'); });
    drop.addEventListener('dragleave',() => drop.classList.remove('file-over'));
    drop.addEventListener('drop',event => { event.preventDefault();drop.classList.remove('file-over');try {selectImage(kind,event.dataTransfer.files[0] ?? null);} catch(error) {message(error.message);} });
  }
  const examples={
    clothing:() => assets.reference?'Put the clothing from <image2> on the person in <image1>. Preserve the face, identity, hair, pose, body proportions, lighting and background. Change only the clothing.':'Replace the clothing in <image1> with an elegant dark green wool jacket. Preserve the face, identity, hair, pose, body proportions, lighting and background. Change only the clothing.',
    background:() => 'Replace the background in <image1> with a sunlit city street. Preserve the person, face, hair, clothing and pose. Match the new background lighting naturally.',
    object:() => 'Remove the unwanted object from <image1> and reconstruct the background naturally. Preserve the person and all other details. Specify the object to remove here:',
  };
  for (const button of document.querySelectorAll('[data-edit-example]')) button.addEventListener('click',() => {get('prompt').value=examples[button.dataset.editExample]();notify();});
  get('prompt').addEventListener('input',notify);
  get('stability-lora').addEventListener('change',notify);
  get('form').addEventListener('submit',event => {event.preventDefault();window.dispatchEvent(new window.CustomEvent('generate-image'));});
  get('show-source').addEventListener('click',() => compare(false));
  get('show-result').addEventListener('click',() => compare(true));
  function restoreCanvas() {
    canvas.width=get('stage-image').naturalWidth;
    canvas.height=get('stage-image').naturalHeight;
    hasMask=Boolean(storedMask);
    if(storedMask) {
      const maskName=storedMask, mask=new window.Image();
      mask.onload=() => {
        if(storedMask!==maskName)return;
        const context=canvas.getContext('2d');context.drawImage(mask,0,0,canvas.width,canvas.height);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        for(let offset=0;offset<pixels.data.length;offset+=4) {
          pixels.data[offset+3]=pixels.data[offset];pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=255;
        }
        context.putImageData(pixels,0,0);
      };
      mask.onerror=() => message('Сохранённое выделение недоступно. Очистите его и выделите область заново.');
      mask.src=imageUrl(storedImage(storedMask));
    }
  }
  get('stage-image').addEventListener('load',restoreCanvas);
  get('local').addEventListener('change',() => {
    canvas.hidden=!get('local').checked;
    get('mask-tools').hidden=!get('local').checked;
    if(get('local').checked)compare(false);
    message(get('local').checked?'Выделите область кистью. Лицо и фон вне выделения сохранятся.':'');notify();
  });
  get('mask-erase').addEventListener('click',() => {erasing=!erasing;get('mask-erase').setAttribute('aria-pressed',String(erasing));});
  get('mask-clear').addEventListener('click',() => {canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);hasMask=false;storedMask='';message('Выделение очищено.');});
  function point(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height,diameter:Number(get('brush-size').value)*canvas.width/rect.width};
  }
  function paint(event) {
    const next=point(event),context=canvas.getContext('2d');
    context.globalCompositeOperation=erasing?'destination-out':'source-over';
    context.strokeStyle='#ffffff';context.fillStyle='#ffffff';context.lineWidth=next.diameter;context.lineCap='round';context.lineJoin='round';
    context.beginPath();context.moveTo(lastPoint?.x ?? next.x,lastPoint?.y ?? next.y);context.lineTo(next.x,next.y);context.stroke();
    context.beginPath();context.arc(next.x,next.y,next.diameter/2,0,Math.PI*2);context.fill();
    lastPoint=next;
    if(!erasing)hasMask=true;
  }
  canvas.addEventListener('pointerdown',event => {
    if(event.button!==0 || get('local').disabled)return;
    event.preventDefault();storedMask='';painting=true;lastPoint=null;canvas.setPointerCapture(event.pointerId);paint(event);message('Выделение готово. Можно уточнить его кистью или ластиком.');
  });
  canvas.addEventListener('pointermove',event => {if(painting)paint(event);});
  const stopPaint=() => {painting=false;lastPoint=null;};
  canvas.addEventListener('pointerup',stopPaint);canvas.addEventListener('pointercancel',stopPaint);
  async function maskFile() {
    const context=canvas.getContext('2d'),pixels=context.getImageData(0,0,canvas.width,canvas.height);
    if(!pixels.data.some((value,index)=>index%4===3 && value>0))throw new Error('Выделите область кистью на исходном фото.');
    // Серверу передаём отдельную непрозрачную маску: белое меняем, чёрное сохраняем.
    for(let offset=0;offset<pixels.data.length;offset+=4) {
      const alpha=pixels.data[offset+3];
      pixels.data[offset]=alpha;pixels.data[offset+1]=alpha;pixels.data[offset+2]=alpha;pixels.data[offset+3]=255;
    }
    const target=document.createElement('canvas');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').putImageData(pixels,0,0);
    const blob=await new Promise(resolve=>target.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Не удалось подготовить выделение.');
    return new File([blob],'selection.png',{type:'image/png'});
  }
  function storedImage(value) {
    const type=/ \[output\]$/.test(value)?'output':'input';
    const path=value.replace(/ \[(input|output)\]$/,'').replaceAll('\\','/'),split=path.lastIndexOf('/');
    return {filename:path.slice(split+1),subfolder:split<0?'':path.slice(0,split),type};
  }
  function useStoredSource(image) {
    const previous=urls.get('source');
    if(previous)URL.revokeObjectURL(previous);
    urls.delete('source');
    get('source-file').value='';
    result=null;hasMask=false;storedMask='';
    canvas.width=canvas.width;
    get('show-result').disabled=true;get('use-result').disabled=true;get('download').hidden=true;get('result-info').textContent='';
    const url=imageUrl(image);
    assets.source={image:`${image.subfolder?image.subfolder+'/':''}${image.filename} [${image.type ?? 'output'}]`,name:displayName(image.filename)};
    get('stage-image').src=url;get('source-preview').src=url;get('source-preview').hidden=false;get('source-name').textContent=assets.source.name;get('source-clear').hidden=false;get('empty').hidden=true;
    compare(false);notify();
  }
  get('use-result').addEventListener('click',() => {if(result)useStoredSource(result);});
  return {
    useSource:useStoredSource,
    showStatus:message,
    get canRun() {return Boolean(assets.source && get('prompt').value.trim());},
    updateAvailability(info,busy) {
      const availability=editAvailability(info,get('local').checked,get('stability-lora').value);
      get('capability').textContent=availability.reason;
      get('submit').disabled=busy || !availability.available || !assets.source || !get('prompt').value.trim();
      get('form').querySelectorAll('input,select,textarea,button:not(#edit-submit)').forEach(input => { input.disabled=busy; });
      get('show-source').disabled=busy || !assets.source;
      get('show-result').disabled=busy || !result;
      get('use-result').disabled=busy || !result;
      if(busy)message('Редактирование выполняется…');
      else if(get('message').textContent==='Редактирование выполняется…')message('');
      return availability.available;
    },
    async prepareSubmission(info) {
      if(!assets.source)throw new Error('Загрузите исходное фото.');
      const prompt=get('prompt').value.trim();
      if(!prompt)throw new Error('Напишите, что изменить на изображении.');
      if(get('local').checked && !hasMask)throw new Error('Выделите область кистью на исходном фото.');
      const availability=editAvailability(info,get('local').checked,get('stability-lora').value);
      if(!availability.available)throw new Error(availability.reason);
      const snapshot={source:assets.source,reference:assets.reference,prompt,quality:get('quality').value,stabilityLora:get('stability-lora').value,seed:get('seed').value.trim(),steps:get('steps').value.trim(),local:get('local').checked};
      const mask=snapshot.local && !storedMask?await maskFile():null;
      const [sourceImage,referenceImage,maskImage]=await Promise.all([snapshot.source.file?uploadImage(snapshot.source.file):snapshot.source.image,snapshot.reference?.file?uploadImage(snapshot.reference.file):snapshot.reference?.image ?? '',mask?uploadImage(mask):snapshot.local?storedMask:'']);
      return createEditSubmission({sourceImage,referenceImage,maskImage,prompt,quality:snapshot.quality,stabilityLora:snapshot.stabilityLora,...(snapshot.seed?{seed:Number(snapshot.seed)}:{}),...(snapshot.steps?{steps:Number(snapshot.steps)}:{})},info);
    },
    showResult(job) {
      result=job.outputs?.[0] ?? null;
      if(!result)return;
      get('result-image').src=imageUrl(result);
      get('download').href=imageUrl(result);
      get('download').hidden=false;
      get('show-result').disabled=false;get('use-result').disabled=false;
      const lora=stabilityLoras[job.settings.stabilityLora]?.label;
      get('result-info').textContent=`Qwen 2.1${lora?` · ${lora} · сила ${job.settings.editLora.strength}`:''} · ${job.settings.steps} шагов · seed ${job.settings.seed}`;
      message('Готово. Изображение сохранено.');compare(true);
    },
    restore(settings) {
      const source=settings.editSourceImage ?? settings.sourceImage;
      if(source)useStoredSource(typeof source==='string'?storedImage(source):source);
      selectImage('reference',null);
      if(settings.referenceImage) {
        const reference=storedImage(settings.referenceImage);
        assets.reference={image:settings.referenceImage,name:displayName(reference.filename)};
        get('reference-preview').src=imageUrl(reference);get('reference-preview').hidden=false;get('reference-name').textContent=assets.reference.name;get('reference-clear').hidden=false;
      }
      storedMask=settings.maskImage ?? '';hasMask=Boolean(storedMask);
      get('local').checked=hasMask;canvas.hidden=!hasMask;get('mask-tools').hidden=!hasMask;
      get('prompt').value=settings.positive ?? '';get('quality').value=settings.quality ?? 'standard';
      get('quality').tomselect?.setValue(get('quality').value,true);
      const savedLora=settings.editLora?.name?.replaceAll('\\','/').split('/').at(-1);
      get('stability-lora').value=Object.hasOwn(stabilityLoras,settings.stabilityLora)?settings.stabilityLora:Object.keys(stabilityLoras).find(key=>stabilityLoras[key].filename===savedLora) ?? 'consistency';
      get('stability-lora').tomselect?.setValue(get('stability-lora').value,true);
      get('seed').value=settings.seed ?? '';get('steps').value=settings.steps ?? '';notify();
      if(get('stage-image').complete && get('stage-image').naturalWidth)restoreCanvas();
    },
  };
}
