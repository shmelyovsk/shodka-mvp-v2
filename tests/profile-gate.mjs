import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {writeFile,readFile,unlink} from 'node:fs/promises';import {join} from 'node:path';
const data=join(process.cwd(),'profile-gate-'+randomUUID()+'.json'),base='http://127.0.0.1:3199';
await writeFile(data,JSON.stringify({users:[11,22,33,44].map(id=>({id:'telegram:'+id,name:'User '+id,age:20,ageGroup:'16+'})),activities:[],applications:[]}));
const mock=`const real=fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://')?Promise.resolve(new Response(JSON.stringify({ok:true,result:String(url).endsWith('/getMe')?{username:'test_shodka_bot'}:[]}))):real(url,options);`;
const child=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'apps/server/dist/index.js'],{env:{...process.env,PORT:'3199',DATA_FILE:data,DATABASE_URL:'',NODE_ENV:'production',MODERATOR_USER_IDS:'telegram:11',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_BOT_POLLING_ENABLED:'false',MAX_BOT_POLLING_ENABLED:'false',REMINDERS_ENABLED:'false',REMINDER_CRON_SECRET:'test-only-reminder-secret-32-characters-long'},stdio:['ignore','ignore','pipe']});let logs='';child.stderr.on('data',d=>logs+=d);
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'User '+id,username:'person_'+id})}),key=createHmac('sha256','WebAppData').update('test').digest(),input=[...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',key).update(input).digest('hex'));return {'x-platform':'telegram','x-init-data':p.toString()};}
async function call(path,id=11,method='GET',body){const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(id?signed(id):{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
async function alter(id,patch){const db=JSON.parse(await readFile(data,'utf8'));Object.assign(db.activities.find(a=>a.id===id),patch);await writeFile(data,JSON.stringify(db));}
const payload={title:'Наша встреча',sport:'Бег',date:new Date(Date.now()+7200000).toISOString(),district:'Сокол',publicPlace:'Парк',exactAddress:'SECRET ADDRESS',capacity:2,level:'any'};
try{
 for(let i=0;i<60;i++){try{await fetch(base+'/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 let result=await call('/api/activities',11,'POST',payload);assert.equal(result.status,400);assert.equal(result.body.code,'PROFILE_INCOMPLETE');assert(result.body.missing.includes('ник СХОДКИ'));
 assert.equal((await call('/api/me',11,'PATCH',{nickname:'host_nick'})).status,200);
 result=await call('/api/activities',11,'POST',payload);assert.equal(result.status,201,'complete profile without photo/bio can create');const id=result.body.id;
 result=await call('/api/activities/'+id+'/applications',22,'POST');assert.equal(result.status,400);assert.equal(result.body.code,'PROFILE_INCOMPLETE');
 assert.equal((await call('/api/me',22,'PATCH',{nickname:'guest_nick'})).status,200);
 assert.equal((await call('/api/activities/'+id+'/applications',22,'POST')).status,201,'complete profile can apply');
 console.log('PASS: server blocks incomplete creation and applications; saving nickname unlocks both; photo and bio stay optional.');
}finally{child.kill();await new Promise(r=>child.once('exit',r));await unlink(data).catch(()=>{});if(logs)console.error(logs);}
