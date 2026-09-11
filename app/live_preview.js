import {outputImage,canvasPlaceholder} from './elements.js';
import {selectedHistoryItem,selectedBatchIndex,selectHistoryItem} from './gallery.js';

export function setupLivePreview(client,{storage=localStorage}={}) {
  const button=document.getElementById('preview-toggle');
  let enabled=true,previewUrl=null,version=0;
  try{enabled=storage.getItem('prism-live-preview')!=='off';}catch{}
  const sync=()=>{
    button.setAttribute('aria-pressed',String(enabled));
    button.title=enabled?'Скрыть превью генерации':'Показать превью генерации';
    button.setAttribute('aria-label',button.title);
    button.querySelector('use').setAttribute('href',enabled?'#icon-eye':'#icon-eye-off');
  };
  const clear=()=>{
    version++;
    if(!previewUrl)return;
    const visible=outputImage.getAttribute('src')===previewUrl;
    URL.revokeObjectURL(previewUrl);previewUrl=null;
    if(!visible)return;
    if(selectedHistoryItem)selectHistoryItem(selectedHistoryItem,selectedBatchIndex);
    else{outputImage.style.display='none';canvasPlaceholder.style.display='flex';}
  };
  button.onclick=()=>{
    enabled=!enabled;sync();
    try{storage.setItem('prism-live-preview',enabled?'on':'off');}catch{}
    if(!enabled)clear();
  };
  client.addEventListener('job',()=>{if(!client.busy)clear();});
  client.addEventListener('preview',async event=>{
    if(!enabled||!client.busy)return;
    const current=++version,blob=event.detail;
    let header;
    try{header=new DataView(await blob.slice(0,8).arrayBuffer());}catch{return;}
    // Отложенное чтение старого кадра не возвращает превью после его отключения.
    if(!enabled||!client.busy||current!==version||header.byteLength<8||header.getUint32(0)!==1)return;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(blob.slice(8,blob.size,header.getUint32(4)===2?'image/png':'image/jpeg'));
    outputImage.src=previewUrl;outputImage.style.display='block';
    document.getElementById('batch-grid').style.display='none';canvasPlaceholder.style.display='none';
  });
  sync();
}
