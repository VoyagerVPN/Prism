// Реальный ComfyUI: цветные CPU-кадры, сохранение и получение 1/4/9 файлов. Без моделей.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {ComfyClient} from '../api.js';
import {validateCapabilities} from '../model_loader.js';
const info = await (await fetch('http://127.0.0.1:8188/object_info')).json();
const colors = [0xe05252,0x53ae70,0x487ad1,0xe6b44c,0xaa69c7,0x4cb9be,0xe3864b,0x738199,0xc27f9c];
const results = [];
for (const count of [1,4,9]) {
  const workflow = {};
  for (let index = 0; index < count; index++) {
    workflow[`frame_${index}_image`] = {class_type:'EmptyImage',inputs:{width:64,height:64,batch_size:1,color:colors[index]}};
    workflow[`frame_${index}_11`] = {class_type:'SaveImage',inputs:{images:[`frame_${index}_image`,0],filename_prefix:`PrismVerification/grid_${count}_${index+1}`}};
  }
  validateCapabilities(workflow,info);
  const client = new ComfyClient({storage:null,pollMs:0});
  await client.submit(workflow,{batchLayout:'square-v1',batchCount:count,seed:100,width:64,height:64,mode:'t2i',positive:'CPU grid verification'});
  const deadline = Date.now()+30000;
  while (client.busy && Date.now()<deadline) {
    await new Promise(resolve => setTimeout(resolve,250));
    await client.reconcile();
  }
  assert.equal(client.job.status,'succeeded',client.job.error);
  assert.equal(client.job.outputs.length,count);
  assert.equal(new Set(client.job.outputs.map(image => image.filename)).size,count);
  results.push(client.job);
  client.close();
  console.log(`${count} CPU images returned in one job: OK`);
}
await mkdir('.cache/verification',{recursive:true});
await writeFile('.cache/verification/batch-fixtures.json',JSON.stringify(results,null,2));
