import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(process.cwd(),'shodka-support-'));
process.env.DATA_FILE=join(dir,'db.json');delete process.env.DATABASE_URL;process.env.MODERATOR_USER_IDS='telegram:999';process.env.TELEGRAM_BOT_TOKEN='test-only';
await writeFile(process.env.DATA_FILE,JSON.stringify({users:[],activities:[],applications:[]}));
const sent=[];let fail=false;const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://api.telegram.org/'))return original(url,options);const body=JSON.parse(options.body);sent.push({method:String(url).split('/').at(-1),...body});return new Response(JSON.stringify({ok:!fail,result:true}),{status:fail?403:200});};
const {handleSupportMessage,installSupportRoutes}=await import('../apps/server/dist/support.js');const {readDatabase}=await import('../apps/server/dist/store.js');
const express=(await import('express')).default;const app=express();app.use(express.json());installSupportRoutes(app,req=>req.header('x-user-id')??'');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
const msg=(text,message_id,extra={})=>handleSupportMessage({text,message_id,chat:{id:123,type:'private'},...extra});
async function call(path,method='GET',body,who='telegram:999'){const r=await original(base+'/api/support'+path,{method,headers:{'content-type':'application/json','x-user-id':who},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
try{
 assert.equal(await msg('/help',1),true);assert.ok(sent.at(-1).reply_markup.keyboard);
 await msg('Как пользоваться',2);assert.ok(sent.at(-1).text.includes('Заявки'));
 await msg('Сообщить о проблеме',3);assert.equal((await readDatabase()).supportDrafts['telegram:123'],'problem');
 await msg('Не открывается встреча',4,{photo:[{file_id:'small'},{file_id:'private-file-id'}]});
 let db=await readDatabase();assert.equal(db.supportTickets.length,1);assert.equal(db.supportTickets[0].attachment.fileId,'private-file-id');assert.equal(db.supportDrafts['telegram:123'],undefined);
 assert.equal(await msg('Обычный текст вне формы',5),true);assert.equal((await readDatabase()).supportTickets.length,1);
 await msg('/idea',6);await msg('Добавьте шахматы',7);assert.equal((await readDatabase()).supportTickets[1].kind,'idea');
 await msg('/idea',8);await msg('/cancel',9);assert.equal((await readDatabase()).supportDrafts['telegram:123'],undefined);
 await msg('/idea',10);await msg('x'.repeat(3001),11);assert.equal((await readDatabase()).supportTickets.length,2);await msg('/cancel',12);
 assert.equal((await call('', 'GET',undefined,'telegram:123')).status,403);
 const list=await call('');assert.equal(list.status,200);assert.equal(list.body.length,2);const ticket=list.body.find(t=>t.kind==='problem');assert.equal(ticket.attachment.fileId,undefined,'file IDs not exposed');
 assert.equal((await call('/'+ticket.id,'PATCH',{status:'bad'})).status,400);
 assert.equal((await call('/'+ticket.id,'PATCH',{status:'working'})).status,200);assert.equal((await readDatabase()).supportTickets.find(t=>t.id===ticket.id).status,'working');
 assert.equal((await call('/'+ticket.id+'/attachment','POST',{})).status,200);assert.equal(sent.at(-1).photo,'private-file-id');assert.equal(sent.at(-1).chat_id,'999');
 assert.equal((await call('/'+ticket.id+'/replies','POST',{text:'Проверяем ошибку'})).status,200);assert.equal(sent.at(-1).chat_id,'123');assert.ok(sent.at(-1).text.includes(ticket.id));
 fail=true;assert.equal((await call('/'+ticket.id+'/replies','POST',{text:'Ошибка доставки'})).status,502);fail=false;
 db=await readDatabase();const replies=db.supportTickets.find(t=>t.id===ticket.id).replies;assert.equal(replies[0].delivery,'sent');assert.equal(replies[1].delivery,'failed');
 assert.equal((await call('/'+ticket.id+'/replies','POST',{text:' ' })).status,400);
 assert.equal((await call('/'+ticket.id+'/replies','POST',{text:'forbidden'},'telegram:123')).status,403);
 await call('/'+ticket.id,'PATCH',{status:'resolved'});assert.equal((await readDatabase()).supportTickets.find(t=>t.id===ticket.id).status,'resolved');
 for(let i=0;i<3;i++){await msg('/idea',20+i*2);await msg('Идея '+i,21+i*2);}await msg('/idea',30);await msg('Шестое обращение',31);assert.equal((await readDatabase()).supportTickets.length,5);assert.ok(sent.at(-1).text.includes('5 обращений'));
 console.log('PASS: support tickets, attachments, persistent drafts, cancellation, limits, moderator permissions, status and reply delivery failures (mock Telegram)');
}finally{globalThis.fetch=original;await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
