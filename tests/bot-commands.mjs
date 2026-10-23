import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch;const token=process.env.TELEGRAM_BOT_TOKEN;const polling=process.env.TELEGRAM_BOT_POLLING_ENABLED;
const messages=[];let commands=[];let updatesRead=false;
process.env.TELEGRAM_BOT_TOKEN='fake-test-token';process.env.TELEGRAM_BOT_POLLING_ENABLED='true';
globalThis.fetch=async(url,options)=>{
 const method=String(url).split('/').at(-1);const data=JSON.parse(options.body);let result=true;
 if(method==='setMyCommands')commands=data.commands;
 if(method==='sendMessage')messages.push(data.text);
 if(method==='getUpdates'){
  if(updatesRead)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('stopped')),{once:true}));
  updatesRead=true;result=[{update_id:1,message:{text:'/id',chat:{id:123,type:'private'}}},{update_id:2,message:{text:'/support',chat:{id:123,type:'private'}}}];
 }
 return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
};
let stop;
try{
 const {startTelegramBot}=await import('../apps/server/dist/telegram.js');stop=startTelegramBot();
 for(let attempt=0;attempt<50&&messages.length<2;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(commands.some(item=>item.command==='id'));assert.ok(commands.some(item=>item.command==='support'));
 assert.ok(messages.some(text=>text.includes('telegram:123')));assert.ok(messages.some(text=>text.includes('Способ оплаты пока готовим')));
 console.log('PASS: /id and /support registration and replies (mock Telegram API)');
}finally{
 stop?.();await new Promise(resolve=>setTimeout(resolve,10));globalThis.fetch=originalFetch;
 if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token;
 if(polling===undefined)delete process.env.TELEGRAM_BOT_POLLING_ENABLED;else process.env.TELEGRAM_BOT_POLLING_ENABLED=polling;
}
