import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch;const token=process.env.TELEGRAM_BOT_TOKEN;const polling=process.env.TELEGRAM_BOT_POLLING_ENABLED;
const payloads=[];const appUrl=process.env.MINI_APP_URL;process.env.MINI_APP_URL="https://app.test/";
const messages=[];let commands=[];let updatesRead=false;
process.env.TELEGRAM_BOT_TOKEN='fake-test-token';process.env.TELEGRAM_BOT_POLLING_ENABLED='true';
globalThis.fetch=async(url,options)=>{
 const method=String(url).split('/').at(-1);const data=JSON.parse(options.body);let result=true;
 if(method==='setMyCommands')commands=data.commands;
 if(method==='sendMessage'){messages.push(data.text);payloads.push(data);}
 if(method==='getUpdates'){
  if(updatesRead)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('stopped')),{once:true}));
  updatesRead=true;result=[{update_id:1,message:{text:'/id',chat:{id:123,type:'private'}}},{update_id:2,message:{text:'/support',chat:{id:123,type:'private'}}},{update_id:3,message:{text:'/start meet_abc123',chat:{id:123,type:'private'}}}];
 }
 return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
};
let stop;
try{
 const {startTelegramBot}=await import('../apps/server/dist/telegram.js');stop=startTelegramBot();
 for(let attempt=0;attempt<50&&messages.length<3;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(commands.some(item=>item.command==='idea'));assert.ok(commands.some(item=>item.command==='cancel'));assert.ok(commands.some(item=>item.command==='help'));assert.ok(commands.some(item=>item.command==='id'));assert.ok(commands.some(item=>item.command==='support'));
 assert.ok(messages.some(text=>text.includes('telegram:123')));assert.ok(messages.some(text=>text.includes('Это добровольно')));
 assert.ok(payloads.some(p=>p.reply_markup?.inline_keyboard?.[0]?.[0]?.url==='https://yoomoney.ru/fundraise/1L700LK69PT.261028'),'support button links to the supplied fundraiser');
 const {Keyboard}=await import('@maxhub/max-bot-api');const {DONATION_URL,DONATION_BUTTON}=await import('../apps/server/dist/donations.js');const maxButton=Keyboard.button.link(DONATION_BUTTON,DONATION_URL);assert.equal(maxButton.url,DONATION_URL);assert.equal(maxButton.text,DONATION_BUTTON);
 assert.ok(payloads.some(p=>p.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url==='https://app.test/?activity=abc123'),'share link opens exact meetup');
 console.log('PASS: /id and /support registration and replies (mock Telegram API)');
}finally{
 if(appUrl===undefined)delete process.env.MINI_APP_URL;else process.env.MINI_APP_URL=appUrl;
 stop?.();await new Promise(resolve=>setTimeout(resolve,10));globalThis.fetch=originalFetch;
 if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token;
 if(polling===undefined)delete process.env.TELEGRAM_BOT_POLLING_ENABLED;else process.env.TELEGRAM_BOT_POLLING_ENABLED=polling;
}
