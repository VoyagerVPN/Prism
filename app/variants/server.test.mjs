import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createVariantServer } from './server.mjs';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('Предпросмотр открывает три варианта и читает персонажей без записи в основной backend',async()=>{
  const upstream=createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({characters:{Isabella:{name:'Isabella'}},revision:'fixture'}));});
  const source=await listen(upstream),server=createVariantServer({upstream:source}),base=await listen(server);
  try{
    const page=await (await fetch(base)).text();
    for(const number of [1,2,3])assert.ok(page.includes(`/variant${number}/`));
    const characters=await (await fetch(base+'/prism/characters')).json();assert.equal(characters.characters.Isabella.name,'Isabella');
    assert.equal((await fetch(base+'/prism/characters',{method:'POST',body:'{}'})).status,405);
    assert.equal((await fetch(base+'/prompt',{method:'POST',body:'{}'})).status,405);
    assert.equal((await fetch(base+'/prism/lora-library/reveal?name=x')).status,404);
    assert.equal((await fetch(base+'/variant1/%2e%2e%2fserver.mjs')).status,404);
  }finally{await close(server);await close(upstream);}
});
