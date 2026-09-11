const dismissibleDialogs=new WeakSet();
const dismissibleDetails=new WeakMap();

export function requestDialogClose(dialog) {
  const cancel=new dialog.ownerDocument.defaultView.Event('cancel',{cancelable:true});
  if(dialog.dispatchEvent(cancel)&&dialog.open)dialog.close();
}

export function makeDialogBackdropDismissible(dialog) {
  if(dismissibleDialogs.has(dialog))return dialog;
  dismissibleDialogs.add(dialog);
  let startedOnBackdrop=false;
  const onBackdrop=event=>{
    if(event.target!==dialog||!dialog.open)return false;
    const rect=dialog.getBoundingClientRect();
    const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    return !inside;
  };
  dialog.addEventListener('pointerdown',event=>{startedOnBackdrop=event.button===0&&onBackdrop(event);},true);
  dialog.addEventListener('pointercancel',()=>{startedOnBackdrop=false;});
  dialog.addEventListener('close',()=>{startedOnBackdrop=false;});
  dialog.addEventListener('click',event=>{
    const dismiss=startedOnBackdrop&&onBackdrop(event);startedOnBackdrop=false;
    if(!dismiss)return;
    requestDialogClose(dialog);
  });
  return dialog;
}

export function makeDetailsOutsideDismissible(details) {
  if(dismissibleDetails.has(details))return dismissibleDetails.get(details);
  const doc=details.ownerDocument;
  const close=event=>{if(details.open&&!details.contains(event.target))details.open=false;};
  const dispose=()=>{doc.removeEventListener('pointerdown',close);dismissibleDetails.delete(details);};
  dismissibleDetails.set(details,dispose);
  doc.addEventListener('pointerdown',close);
  return dispose;
}
