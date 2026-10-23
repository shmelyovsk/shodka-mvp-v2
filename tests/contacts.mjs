import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';
const dir=await mkdtemp(join(process.cwd(),'contacts-test-'));process.env.DATA_FILE=join(dir,'db.json');delete process.env.DATABASE_URL;process.env.TELEGRAM_BOT_TOKEN='fake';
await writeFile(process.env.DATA_FILE,JSON.stringify({users:[{id:'max:1',name:'Max',age:20},{id:'telegram:2',name:'TG',age:20},{id:'telegram:3',name:'Other',age:20}],activities:[],applications:[]}));
const original=globalThis.fetch;const sent=[];globalThis.fetch=async(url,opts)=>{if(!String(url).startsWith('https://api.telegram.org'))return original(url,opts);sent.push(JSON.parse(opts.body));return new Response(JSON.stringify({ok:true,result:{username:'test_shodka_bot'}}));};
const {installContactRoutes,acceptTelegramLink,syncTelegramContact,verifiedContact,refreshTelegramContacts}=await import('../apps/server/dist/contacts.js');const {readDatabase,writeDatabase}=await import('../apps/server/dist/store.js');const {canSeeContact}=await import('../apps/server/dist/social.js');const express=(await import('express')).default,app=express();app.use(express.json());installContactRoutes(app,req=>req.header('x-user-id')??'');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
async function link(who='max:1'){const r=await original('http://127.0.0.1:'+server.address().port+'/api/telegram-link',{method:'POST',headers:{'content-type':'application/json','x-user-id':who},body:'{}'});return {status:r.status,body:await r.json()};}
try{
 assert.equal((await link('telegram:2')).status,400);
 let result=await link();assert.equal(result.status,200);let token=new URL(result.body.url).searchParams.get('start');let db=await readDatabase();assert.equal(db.telegramLinks.length,1);assert.equal(JSON.stringify(db).includes(token),false,'raw token not stored');
 await acceptTelegramLink('/start '+token,2,undefined);assert.equal(verifiedContact((await readDatabase()).users[0]),false);assert.equal((await readDatabase()).telegramLinks.length,1,'missing username does not consume valid challenge');
 await acceptTelegramLink('/start '+token,2,'trusted_name');db=await readDatabase();assert.equal(db.users[0].telegramContact,'trusted_name');assert.equal(db.users[0].telegramOwnerId,'telegram:2');assert.equal(db.telegramLinks.length,0);
 await acceptTelegramLink('/start '+token,3,'attacker_name');assert.equal((await readDatabase()).users[0].telegramOwnerId,'telegram:2','used token cannot change owner');
 await refreshTelegramContacts('telegram:2','new_real_name');db=await readDatabase();assert.equal(db.users[0].telegramContact,'new_real_name');assert.equal(db.users[1].telegramContact,'new_real_name');
 await refreshTelegramContacts('telegram:2',undefined);assert.equal(verifiedContact((await readDatabase()).users[0]),false,'removed username clears linked MAX contact');
 await refreshTelegramContacts('telegram:2','real_name');
 result=await link();token=new URL(result.body.url).searchParams.get('start');db=await readDatabase();db.telegramLinks[0].expiresAt='2000-01-01T00:00:00Z';await writeDatabase(db);await acceptTelegramLink('/start '+token,3,'attacker_name');assert.equal((await readDatabase()).users[0].telegramOwnerId,'telegram:2','expired token rejected');
 const first=await link(),second=await link();await acceptTelegramLink('/start '+new URL(first.body.url).searchParams.get('start'),3,'attacker_name');assert.equal((await readDatabase()).users[0].telegramOwnerId,'telegram:2','new link invalidates prior one');
 db=await readDatabase();const target=db.users[0];target.shareContact=false;const viewer='telegram:3';db.activities=[{id:'meet',organizerId:target.id,status:'open'}];db.applications=[{activityId:'meet',userId:viewer,status:'pending'}];assert.equal(canSeeContact(db,viewer,target),false);
 db.applications[0].status='approved';assert.equal(canSeeContact(db,viewer,target),true,'approved contact ignores obsolete false switch');
 assert.equal(canSeeContact(db,'unrelated',target),false);
 db.activities[0].status='cancelled';assert.equal(canSeeContact(db,viewer,target),false);
 db.friendships=[{from:viewer,to:target.id,status:'accepted'}];assert.equal(canSeeContact(db,viewer,target),true,'accepted friend sees verified contact');
 delete target.telegramOwnerId;assert.equal(canSeeContact(db,viewer,target),false,'old manually entered contact is not shared');
 console.log('PASS: verified contact visibility, MAX linking, signed owner updates, username removal, expiring/replaced/single-use tokens; no real Telegram calls');
}finally{globalThis.fetch=original;await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
