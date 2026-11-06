import {staticMessages} from './static_messages.js';

export function captureStaticTranslations(doc) {
  const entries=[];
  const walker=doc.createTreeWalker(doc.documentElement, 4);
  while(walker.nextNode()) {
    const node=walker.currentNode, parent=node.parentElement;
    if(!parent || parent.closest('script,style,textarea,[contenteditable="true"]'))continue;
    const original=node.data, source=original.trim();
    if(!Object.hasOwn(staticMessages,source))continue;
    if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.value=parent.textContent;
    entries.push({node,original,source,last:original});
  }
  for(const element of doc.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    for(const attribute of ['title','aria-label','placeholder','alt']) {
      const source=element.getAttribute(attribute);
      if(source&&Object.hasOwn(staticMessages,source))entries.push({element,attribute,source,last:source});
    }
  }
  return localization=>{
    for(const entry of entries) {
      const value=localization.language==='ru'?entry.source:localization.t(`static.${entry.source}`,{keySeparator:false,defaultValue:entry.source});
      if(entry.node){
        if(!entry.node.isConnected||entry.node.data!==entry.last)continue;
        entry.last=entry.original.replace(entry.source,()=>value);entry.node.data=entry.last;
      } else {
        if(!entry.element.isConnected||entry.element.getAttribute(entry.attribute)!==entry.last)continue;
        entry.last=value;entry.element.setAttribute(entry.attribute,value);
      }
    }
  };
}
