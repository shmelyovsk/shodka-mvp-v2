import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {writeFile,readFile,unlink} from 'node:fs/promises';import {join} from 'node:path';
const data=join(process.cwd(),'meetups-'+randomUUID()+'.json'),base='http://127.0.0.1:3198';
await writeFile(data,JSON.stringify({users:[11,22,33,44].map(id=>({id:'telegram:'+id,name:'User '+id,age:20,ageGroup:'16+',nickname:'person_'+id})),activities:[],applications:[]}));
const mock=`const real=fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://')?Promise.resolve(new Response(JSON.stringify({ok:true,result:String(url).endsWith('/getMe')?{username:'test_shodka_bot'}:[]}))):real(url,options);`;
const child=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'apps/server/dist/index.js'],{env:{...process.env,PORT:'3198',DATA_FILE:data,DATABASE_URL:'',NODE_ENV:'production',MODERATOR_USER_IDS:'telegram:11',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_BOT_POLLING_ENABLED:'false',MAX_BOT_POLLING_ENABLED:'false',REMINDERS_ENABLED:'false',REMINDER_CRON_SECRET:'test-only-reminder-secret-32-characters-long'},stdio:['ignore','ignore','pipe']});let logs='';child.stderr.on('data',d=>logs+=d);
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'User '+id,username:'person_'+id})}),key=createHmac('sha256','WebAppData').update('test').digest(),input=[...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',key).update(input).digest('hex'));return {'x-platform':'telegram','x-init-data':p.toString()};}
async function call(path,id=11,method='GET',body){const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(id?signed(id):{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
async function alter(id,patch){const db=JSON.parse(await readFile(data,'utf8'));Object.assign(db.activities.find(a=>a.id===id),patch);await writeFile(data,JSON.stringify(db));}
const payload={title:'Наша встреча',sport:'Бег',date:new Date(Date.now()+7200000).toISOString(),district:'Сокол',publicPlace:'Парк',exactAddress:'SECRET ADDRESS',capacity:2,level:'any'};
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await call('/internal/reminders',0,'POST')).status,401);
 const tick=await fetch(base+'/internal/reminders',{method:'POST',headers:{authorization:'Bearer test-only-reminder-secret-32-characters-long'}});assert.equal(tick.status,200);assert.equal((await tick.json()).sent,0);
 assert.equal((await call('/api/favorites',0)).status,401);for(const id of [11,22,33,44])await call('/api/me',id);
 assert.equal((await call('/api/activities',11,'POST',{...payload,title:'Сука'})).status,400,'moderator has the same text filter');
 assert.equal((await call('/api/activities',22,'POST',{...payload,title:'Сука'})).status,400,'regular user has the same text filter');
 assert.equal((await call('/api/me',11,'PATCH',{bio:'идиот'})).status,400,'moderator profile text checked');
 const a=(await call('/api/activities',11,'POST',payload)).body;assert.ok(a.id);
 assert.equal((await call('/api/favorites/'+a.id,22,'PUT')).status,200);assert.equal((await call('/api/favorites/'+a.id,22,'PUT')).status,200);let fav=(await call('/api/favorites',22)).body;assert.equal(fav.length,1);assert.equal(fav[0].exactAddress,undefined);assert.equal((await call('/api/favorites',33)).body.length,0);
 const share=await call('/api/activities/'+a.id+'/share',22);assert.equal(share.status,200);assert.ok(share.body.url.endsWith('?start=meet_'+a.id));assert.equal(share.body.url.includes('SECRET'),false);
 const p=(await call('/api/activities/'+a.id+'/applications',22,'POST')).body;assert.ok(p.id);
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,1,'pending future request is in inbox');
 assert.equal((await call('/api/activities/'+a.id,22)).body.applicationStatus,'pending');assert.equal((await call('/api/applications/'+p.id,11,'PATCH',{status:'approved'})).status,200);
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,0,'approved request leaves inbox');
 assert.equal((await call('/api/organizers/telegram:11/applications?history=true',11)).body[0].status,'approved','history is preserved');
 assert.equal((await call('/api/organizers/telegram:11/applications?history=true',22)).status,403,'history remains private');
 assert.equal((await call('/api/activities?free=true',22)).body.some(v=>v.id===a.id),false,'full meeting excluded');
 assert.equal((await call('/api/activities?format=online',22)).body.some(v=>v.id===a.id),false);
 assert.equal((await call('/api/activities/'+a.id+'/leave',33,'POST')).status,404);assert.equal((await call('/api/activities/'+a.id+'/leave',11,'POST')).status,400);
 assert.equal((await call('/api/activities/'+a.id+'/leave',22,'POST')).status,200);assert.equal((await call('/api/activities/'+a.id+'/leave',22,'POST')).status,200);let detail=(await call('/api/activities/'+a.id,22)).body;assert.equal(detail.approvedCount,1);assert.equal(detail.status,'open');assert.equal(detail.applicationStatus,'withdrawn');assert.equal(detail.exactAddress,undefined);assert.equal((await call('/api/profiles/telegram:11',22)).body.contact,null);
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,0,'withdrawn request stays out of inbox');
 assert.equal((await call('/api/activities?free=true',22)).body.some(v=>v.id===a.id),true);
 assert.equal((await call('/api/applications/'+p.id,11,'PATCH',{status:'approved'})).status,409,'organizer cannot reinstate withdrawn participant without new application');
 const again=await call('/api/activities/'+a.id+'/applications',22,'POST');assert.equal(again.status,201);assert.equal(again.body.id,p.id);assert.equal(again.body.status,'pending');await call('/api/applications/'+p.id,11,'PATCH',{status:'approved'});
 assert.equal((await call('/api/activities/'+a.id+'/finish',22,'POST',{outcome:'completed'})).status,403);assert.equal((await call('/api/activities/'+a.id+'/finish',11,'POST',{outcome:'completed'})).status,409,'cannot finish future meeting');
 await alter(a.id,{date:new Date(Date.now()-1000).toISOString()});assert.equal((await call('/api/activities',22)).body.some(v=>v.id===a.id),true,'started today stays until midnight');assert.equal((await call('/api/activities/'+a.id+'/leave',22,'POST')).status,409);
 const review={activityId:a.id,userId:'telegram:11',score:5,text:'Всё хорошо',attended:true};assert.equal((await call('/api/reviews',22,'POST',review)).status,409);
 assert.equal((await call('/api/activities/'+a.id+'/finish',11,'POST',{outcome:'bad'})).status,400);assert.equal((await call('/api/activities/'+a.id+'/finish',11,'POST',{outcome:'completed'})).status,200);assert.equal((await call('/api/activities/'+a.id+'/finish',11,'POST',{outcome:'completed'})).status,200);assert.equal((await call('/api/activities/'+a.id+'/finish',11,'POST',{outcome:'not_held'})).status,409);assert.equal((await call('/api/activities/'+a.id+'/cancel',11,'POST')).status,409);
 assert.equal((await call('/api/activities',22)).body.some(v=>v.id===a.id),false);assert.equal((await call('/api/favorites',22)).body[0].status,'completed');assert.equal((await call('/api/reviews',22,'POST',review)).status,201,'review immediately after held completion');assert.equal((await call('/api/reviews',22,'POST',review)).status,409);
 const b=(await call('/api/activities',11,'POST',{...payload,title:'Другая встреча',capacity:3})).body;const pb=(await call('/api/activities/'+b.id+'/applications',22,'POST')).body;await call('/api/applications/'+pb.id,11,'PATCH',{status:'approved'});await alter(b.id,{date:new Date(Date.now()-1000).toISOString()});assert.equal((await call('/api/activities/'+b.id+'/finish',11,'POST',{outcome:'not_held'})).status,200);assert.equal((await call('/api/reviews',22,'POST',{...review,activityId:b.id})).status,403);assert.equal((await call('/api/profiles/telegram:11',22)).body.eligibleActivities.some(v=>v.id===b.id),false);
 assert.equal((await call('/api/reviews',11,'POST',{activityId:a.id,userId:'telegram:22',score:5,text:'идиот',attended:true})).status,400,'moderator reviews filtered');
 const c=(await call('/api/activities',11,'POST',{...payload,title:'Встреча для новичков',capacity:4})).body;
 const pc=(await call('/api/activities/'+c.id+'/applications',33,'POST')).body;
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,1);
 await call('/api/applications/'+pc.id,11,'PATCH',{status:'rejected'});
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,0,'rejected request leaves inbox');
 const pd=(await call('/api/activities/'+c.id+'/applications',44,'POST')).body;
 await alter(c.id,{date:new Date(Date.now()-1000).toISOString()});
 assert.equal((await call('/api/organizers/telegram:11/applications',11)).body.length,0,'pending request on started meetup leaves inbox');
 const archive=(await call('/api/organizers/telegram:11/applications?history=true',11)).body;
 assert.ok(archive.some(p=>p.id===pc.id&&p.status==='rejected'));assert.ok(archive.some(p=>p.id===pd.id&&p.status==='pending'),'old pending request not deleted');
 await call('/api/favorites/'+a.id,22,'DELETE');assert.equal((await call('/api/favorites',22)).body.length,0);
 const stored=JSON.parse(await readFile(data,'utf8'));assert.equal(stored.activities.find(v=>v.id===a.id).status,'completed');assert.ok(stored.activities.find(v=>v.id===a.id).endedAt);assert.equal(stored.activities.find(v=>v.id===b.id).status,'not_held');
 console.log('PASS: finish outcomes/authorization/idempotency, archive, review gating, withdrawal/reapply/capacity/privacy, private favorites, sharing and feed filters');
}finally{child.kill();await new Promise(r=>child.once('exit',r));await unlink(data).catch(()=>{});if(logs)console.error(logs);}
