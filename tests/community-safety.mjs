import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {writeFile,readFile,unlink} from 'node:fs/promises';import {join} from 'node:path';
const data=join(process.cwd(),'community-safety-'+randomUUID()+'.json'),base='http://127.0.0.1:3201';
await writeFile(data,JSON.stringify({users:[11,22,33,44].map(id=>({id:'telegram:'+id,name:'User '+id,age:20,ageGroup:'16+',nickname:'person_'+id})),activities:[],applications:[]}));
const mock=`const real=fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://')?Promise.resolve(new Response(JSON.stringify({ok:true,result:String(url).endsWith('/getMe')?{username:'test_shodka_bot'}:[]}))):real(url,options);`;
const child=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'apps/server/dist/index.js'],{env:{...process.env,PORT:'3201',DATA_FILE:data,DATABASE_URL:'',NODE_ENV:'production',MODERATOR_USER_IDS:'telegram:11',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_BOT_POLLING_ENABLED:'false',MAX_BOT_POLLING_ENABLED:'false',REMINDERS_ENABLED:'false',REMINDER_CRON_SECRET:'test-only-reminder-secret-32-characters-long'},stdio:['ignore','ignore','pipe']});let logs='';child.stderr.on('data',d=>logs+=d);
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'User '+id,username:'person_'+id})}),key=createHmac('sha256','WebAppData').update('test').digest(),input=[...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',key).update(input).digest('hex'));return {'x-platform':'telegram','x-init-data':p.toString()};}
async function call(path,id=11,method='GET',body){const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(id?signed(id):{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
async function alter(id,patch){const db=JSON.parse(await readFile(data,'utf8'));Object.assign(db.activities.find(a=>a.id===id),patch);await writeFile(data,JSON.stringify(db));}
const payload={title:'Наша встреча',sport:'Бег',date:new Date(Date.now()+7200000).toISOString(),district:'Сокол',publicPlace:'Парк',exactAddress:'SECRET ADDRESS',capacity:2,level:'any'};
try{
 for(let i=0;i<60;i++){try{await fetch(base+'/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 for(const id of [11,22,33,44])await call('/api/me',id);
 const a=(await call('/api/activities',11,'POST',{...payload,capacity:3})).body;
 const b=(await call('/api/activities',11,'POST',{...payload,capacity:4,title:'Ещё одна встреча'})).body;
 const c=(await call('/api/activities',22,'POST',{...payload,capacity:4,title:'Встреча другого организатора'})).body;
 for(const id of [22,33]){const p=(await call('/api/activities/'+a.id+'/applications',id,'POST')).body;assert.equal((await call('/api/applications/'+p.id,11,'PATCH',{status:'approved'})).status,200);}
 const pending=(await call('/api/activities/'+b.id+'/applications',22,'POST')).body;
 await call('/api/friends',22,'POST',{userId:'telegram:11'});
 assert.equal((await call('/api/blocks/telegram:11',11,'POST',{})).status,400,'no self-block');
 assert.equal((await call('/api/blocks/telegram:22',11,'POST',{excludeActivityIds:[c.id]})).status,409,'cannot exclude from someone else meeting');
 assert.equal((await call('/api/blocks',11)).body.length,0,'failed exclusion does not save a block');
 assert.equal((await call('/api/blocks/telegram:22',11,'POST',{})).status,200);
 let detail=(await call('/api/activities/'+a.id,11)).body;assert.equal(detail.approvedCount,3,'plain block keeps accepted attendance');
 assert.equal((await call('/api/friends',11)).body.length,0,'friend request removed');
 assert.equal((await call('/api/profiles/telegram:22',11)).body.contact,null,'shared-meeting contacts hidden by block');
 assert.equal((await call('/api/blocks',22)).body.length,0,'cannot read other users block list');
 assert.equal((await call('/api/friends',22,'POST',{userId:'telegram:11'})).status,403);
 assert.equal((await call('/api/friends',11,'POST',{userId:'telegram:22'})).status,403);
 assert.equal((await call('/api/activities/'+b.id+'/applications',22,'POST')).status,403);
 assert.equal((await call('/api/activities/'+c.id+'/applications',11,'POST')).status,403,'bidirectional application restriction');
 assert.equal((await call('/api/applications/'+pending.id,11,'PATCH',{status:'approved'})).status,403,'cannot bypass via approval');
 await call('/api/blocks/telegram:11',22,'DELETE');assert.equal((await call('/api/blocks',11)).body.length,1,'unblock only changes own records');
 await call('/api/blocks/telegram:22',11,'DELETE');assert.equal((await call('/api/friends',11)).body.length,0,'unblock does not restore friendship');
 assert.equal((await call('/api/friends',22,'POST',{userId:'telegram:11'})).status,201,'new requests possible after unblock');
 assert.equal((await call('/api/blocks/telegram:22',11,'POST',{excludeActivityIds:[a.id]})).status,200);
 detail=(await call('/api/activities/'+a.id,11)).body;assert.equal(detail.approvedCount,2);assert.equal(detail.status,'open','exclusion frees a place');
 assert.equal((await call('/api/activities/'+a.id+'/feedback',33,'POST',{met:true})).status,409,'cannot answer before completion');
 await alter(a.id,{status:'completed',endedAt:new Date(Date.now()-1000).toISOString(),date:new Date(Date.now()-3600000).toISOString()});
 assert((await call('/api/after-meetings',33)).body.some(item=>item.id===a.id));
 assert.equal((await call('/api/activities/'+a.id+'/feedback',44,'POST',{met:true})).status,403,'outsiders cannot answer');
 assert.equal((await call('/api/activities/'+a.id+'/feedback',22,'POST',{met:true})).status,403,'excluded user cannot answer');
 let answer=await call('/api/activities/'+a.id+'/feedback',33,'POST',{met:false});assert.equal(answer.status,200);assert.equal(answer.body.people.length,0);
 assert(!(await call('/api/after-meetings',33)).body.some(item=>item.id===a.id),'answered prompt does not repeat');
 answer=await call('/api/activities/'+a.id+'/feedback',33,'POST',{met:true});assert.equal(answer.body.people[0].id,'telegram:11');
 let db=JSON.parse(await readFile(data,'utf8'));assert.equal((db.reviews??[]).length,0,'attendance answer does not fabricate rating');assert.equal(db.activities.find(item=>item.id===a.id).status,'completed','private answer leaves common result intact');
 const review=await call('/api/reviews',33,'POST',{activityId:a.id,userId:'telegram:11',score:5,text:'Спасибо за встречу',attended:true});assert.equal(review.status,201);
 answer=await call('/api/activities/'+a.id+'/feedback',33,'POST',{met:true});assert.equal(answer.body.people[0].reviewed,true);
 console.log('PASS: private blocks, bidirectional friend/application/approval restrictions, explicit exclusion/capacity, safe unblock, completed-only participant feedback, no automatic ratings and existing reviews.');
}finally{child.kill();await new Promise(r=>child.once('exit',r));await unlink(data).catch(()=>{});if(logs)console.error(logs);}
