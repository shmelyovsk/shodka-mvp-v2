import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
const base = 'http://127.0.0.1:3197';
const dataFile = join(process.cwd(), `shodka-test-${randomUUID()}.json`);
const mock = `const real = globalThis.fetch; globalThis.fetch = (url, options) => String(url).startsWith('https://') ? Promise.resolve(new Response(JSON.stringify({ok:true,result:[],user_id:1,first_name:'Bot',is_bot:true}))) : real(url,options);`;
const child = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(mock), 'apps/server/dist/index.js'], {
  env: {...process.env, PORT:'3197', DATA_FILE:dataFile, NODE_ENV:'production', DEMO_MODE:'true',
    MAX_BOT_TOKEN:'max-test', TELEGRAM_BOT_TOKEN:'telegram-test', MAX_BOT_POLLING_ENABLED:'false', TELEGRAM_BOT_POLLING_ENABLED:'false'},
  stdio:['ignore','pipe','pipe'],
});
let logs=''; child.stderr.on('data', data => logs += data);
function signed(platform,id,extra={}) {
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:platform}),...extra});
  const secret=createHmac('sha256','WebAppData').update(platform+'-test').digest();
  const input=[...params].sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>`${k}=${v}`).join('\n');
  params.set('hash',createHmac('sha256',secret).update(input).digest('hex'));
  return {'x-platform':platform,'x-init-data':params.toString()};
}
async function call(path,headers={},method='GET',body) {
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
try {
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await call('/api/me')).status,401,'production must reject demo fallback');
 const max=signed('max',123),tg=signed('telegram',123);
 assert.equal((await call('/api/me',max)).body.user.id,'max:123');
 assert.equal((await call('/api/me',tg)).body.user.id,'telegram:123');
 assert.equal((await call('/api/me',tg,'PATCH',{age:15})).status,400);
 for(const headers of [max,tg]) assert.equal((await call('/api/me',headers,'PATCH',{age:20})).status,200);
 const created=await call('/api/activities',max,'POST',{title:'Cross platform',sport:'Бег',date:new Date(Date.now()+86400000).toISOString(),district:'Сокол',publicPlace:'Парк',exactAddress:'SECRET ADDRESS',level:'any',capacity:2});
 assert.equal(created.status,201);const id=created.body.id;
 assert.equal((await call(`/api/activities/${id}`,tg)).body.exactAddress,undefined);
 assert.equal((await call('/api/users/max:123/activities',tg)).status,403);
 assert.equal((await call('/api/organizers/max:123/applications',tg)).status,403);
 const applied=await call(`/api/activities/${id}/applications`,tg,'POST',{});assert.equal(applied.status,201);
 assert.equal((await call(`/api/applications/${applied.body.id}`,tg,'PATCH',{status:'approved'})).status,403);
 assert.equal((await call(`/api/applications/${applied.body.id}`,max,'PATCH',{status:'approved'})).status,200);
 assert.equal((await call(`/api/activities/${id}`,tg)).body.exactAddress,'SECRET ADDRESS');
 assert.equal((await call(`/api/activities/${id}`)).body.exactAddress,undefined);
 const tampered={...tg,'x-init-data':tg['x-init-data'].replace('telegram','impostor')};
 assert.equal((await call('/api/me',tampered)).status,401);
 assert.equal((await call('/api/me',signed('telegram',123,{auth_date:'1'}))).status,401);
 assert.equal((await call('/api/me',{...tg,'x-init-data':tg['x-init-data']+'&auth_date=1'})).status,401);
 assert.equal((await call('/api/users/max:123/activities', {...tg, 'x-user-id':'max:123'})).status,403);
 const reverse = await call('/api/activities', tg, 'POST', {title:'Telegram host',sport:'Бег',date:new Date(Date.now()+86400000).toISOString(),district:'Сокол',publicPlace:'Парк',level:'any',capacity:3});
 assert.equal(reverse.status,201);
 assert.equal((await call(`/api/activities/${reverse.body.id}/applications`,max,'POST',{})).status,201);
 assert.equal((await call(`/api/applications/${applied.body.id}`,max,'PATCH',{status:'rejected'})).status,200);
 assert.equal((await call(`/api/activities/${id}`,tg)).body.exactAddress,undefined);
 assert.equal((await call(`/api/activities/${id}`,max)).body.status,'open');
 assert.equal((await call(`/api/activities/${id}/cancel`,max,'POST',{})).status,200);
 console.log('PASS: MAX → Telegram shared activity, approval, address privacy, access controls, age, stale/tampered/duplicate signatures, production demo lockout');
} catch(error){ console.error(logs);throw error; }
finally {child.kill();await new Promise(r=>child.once('exit',r));await unlink(dataFile).catch(()=>{});}
