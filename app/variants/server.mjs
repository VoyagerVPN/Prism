import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const landing=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prism — варианты персонажей</title><style>body{margin:0;background:#101216;color:#e7e9ee;font:16px/1.6 system-ui}main{max-width:900px;margin:12vh auto;padding:24px}h1{font-size:30px}p{color:#a9b0bc}.variants{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:32px 0}a{display:block;padding:28px;border:1px solid #343b48;border-radius:12px;background:#1a1e26;color:#edf1f8;text-decoration:none}a:hover{border-color:#b4bece}small{color:#a9b0bc}</style><main><h1>Персонаж и текущая генерация</h1><p>Три независимых варианта управления внешностью, одеждой и тегами. Откройте каждый и попробуйте один и тот же сценарий.</p><div class="variants"><a href="/variant1/">Вариант 1 →</a><a href="/variant2/">Вариант 2 →</a><a href="/variant3/">Вариант 3 →</a></div><small>Исходные персонажи читаются из Prism. Изменения остаются внутри выбранного варианта; генерация изображений здесь не запускается.</small></main></html>`;

export function createVariantServer({root=directory,upstream='http://127.0.0.1:8188'}={}) {
  return createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    const reply=(status,text,type='text/plain; charset=utf-8')=>{response.writeHead(status,{'Content-Type':type});response.end(text);};
    if(request.method!=='GET'&&request.method!=='HEAD'){response.setHeader('Allow','GET, HEAD');reply(405,'Варианты работают только с чтением исходных данных.');return;}
    try{
      const url=new URL(request.url,'http://localhost');
      if(url.pathname==='/'||url.pathname==='/index.html'){reply(200,landing,types['.html']);return;}
      // Разрешены только исходные данные и локальные превью, без записи и запуска генерации.
      if(['/prism/characters','/prism/lora-library','/prism/lora-preview'].includes(url.pathname)){
        const source=await fetch(upstream+url.pathname+url.search,{signal:AbortSignal.timeout(20000),redirect:'error'});
        const data=Buffer.from(await source.arrayBuffer());reply(source.status,data,source.headers.get('content-type')||'application/octet-stream');return;
      }
      const match=url.pathname.match(/^\/(variant[123])(?:\/(.*))?$/);
      if(!match){reply(404,'Страница не найдена');return;}
      if(match[2]===undefined){response.writeHead(302,{Location:`/${match[1]}/`});response.end();return;}
      const relative=decodeURIComponent(match[2]||'index.html');
      if(relative.includes('\\')||relative.includes('\0')||relative.split('/').some(segment=>segment==='..'||segment==='.')){reply(404,'Файл не найден');return;}
      const base=path.resolve(root,match[1]),file=path.resolve(base,relative),type=types[path.extname(file).toLowerCase()];
      if(!file.startsWith(base+path.sep)||!type){reply(404,'Файл не найден');return;}
      try{reply(200,await readFile(file),type);}catch(error){if(error.code==='ENOENT'||error.code==='EISDIR')reply(404,'Вариант ещё готовится. Обновите страницу позднее.');else throw error;}
    }catch(error){reply(502,`Не удалось получить данные Prism: ${error.message}`);}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PRISM_VARIANTS_PORT||8190);
  const server=createVariantServer();server.listen(port,'127.0.0.1',()=>console.log(`Prism variants: http://127.0.0.1:${port}/`));
}
