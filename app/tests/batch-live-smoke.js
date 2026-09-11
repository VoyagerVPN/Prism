// Реальный ComfyUI: 1/4/9 CPU-кадров и отдельная сетка для серий. Без загрузки моделей.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {ComfyClient,imageUrl} from '../api.js';
import {compileWorkflow} from '../workflow.js';
import {validateCapabilities} from '../model_loader.js';
const info = await (await fetch('http://127.0.0.1:8188/object_info')).json();
const colors = [0xe05252,0x53ae70,0x487ad1,0xe6b44c,0xaa69c7,0x4cb9be,0xe3864b,0x738199,0xc27f9c];
const results = [];
const queue=await (await fetch('http://127.0.0.1:8188/queue')).json();
assert.equal(queue.queue_running.length+queue.queue_pending.length,0,'Проверка требует свободной очереди');
for (const count of [1,4,9]) {
  const width=count===4?1024:64,height=count===4?1536:96;
  const settings={recipe:'checkpoint',batchLayout:'square-v1',batchCount:count,seed:100,width,height,positive:'CPU grid verification',checkpoint:'novaKemonoXL_v80.safetensors',filenamePrefix:`PrismVerification/grid_${count}`};
  const compiled=compileWorkflow(settings);
  validateCapabilities(compiled,info);
  for (let index = 0; index < count; index++) {
    const save=compiled[count===1?'11':`frame_${index}_11`];
    compiled[save.inputs.images[0]]={class_type:'EmptyImage',inputs:{width,height,batch_size:1,color:colors[index]}};
  }
  // Сохраняем реальные ветви вывода компилятора, заменяя только дорогую диффузию цветными кадрами.
  const reachable=new Set();
  const visit=id=>{if(reachable.has(id))return;reachable.add(id);for(const value of Object.values(compiled[id].inputs))if(Array.isArray(value)&&compiled[value[0]])visit(value[0]);};
  for(const [id,node] of Object.entries(compiled))if(node.class_type==='SaveImage')visit(id);
  const workflow=Object.fromEntries(Object.entries(compiled).filter(([id])=>reachable.has(id)));
  validateCapabilities(workflow,info);
  const client = new ComfyClient({storage:null,pollMs:0});
  await client.submit(workflow,settings);
  const deadline = Date.now()+30000;
  while (client.busy && Date.now()<deadline) {
    await new Promise(resolve => setTimeout(resolve,250));
    await client.reconcile();
  }
  assert.equal(client.job.status,'succeeded',client.job.error);
  const expected=count===1?1:count+1;
  assert.equal(client.job.outputs.length,expected);
  assert.equal(new Set(client.job.outputs.map(image => image.filename)).size,expected);
  for(const output of client.job.outputs){
    const response=await fetch(imageUrl(output));assert.equal(response.status,200);
    const png=Buffer.from(await response.arrayBuffer());
    const side=output.filename===client.job.gridOutput?.filename?Math.sqrt(count):1;
    assert.equal(png.readUInt32BE(16),width*side);assert.equal(png.readUInt32BE(20),height*side);
  }
  results.push(client.job);
  client.close();
  console.log(`${count} кадров, ${expected} PNG, сетка ${count===1?'не нужна':`${width*Math.sqrt(count)}×${height*Math.sqrt(count)}`}: OK`);
}
await mkdir('../.cache/verification',{recursive:true});
await writeFile('../.cache/verification/batch-fixtures.json',JSON.stringify(results,null,2));
