import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=(await readFile(new URL('../apps/web/src/api.ts',import.meta.url),'utf8')).replaceAll('import.meta.env','({VITE_API_URL:"https://api.test",PROD:true})');
let serial=0;
async function client(){globalThis.window={location:{hash:""}};const js=ts.transpileModule(source+'\n// scenario '+serial++,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
try{
 globalThis.fetch=async()=>new Response('<!DOCTYPE html><h1>Not found</h1>',{status:404,headers:{'content-type':'text/html'}});
 await assert.rejects((await client()).api('/api/me'),/сервер пока другой версии/);
 globalThis.fetch=async()=>json({apiVersion:4});await assert.rejects((await client()).api('/api/me'),/сервер пока другой версии/);
 globalThis.fetch=async()=>json({apiVersion:3});await assert.rejects((await client()).api('/api/me'),/сервер пока другой версии/);
 globalThis.fetch=async url=>String(url).endsWith('capabilities')?json({apiVersion:4,features:["verifiedContacts","meetupLifecycle"]}):new Response('<html>error</html>',{status:502,headers:{'content-type':'text/html'}});
 await assert.rejects((await client()).api('/api/profiles/123'),/временно недоступен/);
 globalThis.fetch=async url=>String(url).endsWith('capabilities')?json({apiVersion:4,features:["verifiedContacts","meetupLifecycle"]}):json({user:{nickname:'ira',telegramContact:'ira_name'}});
 assert.equal((await (await client()).api('/api/me')).user.nickname,'ira');
 globalThis.fetch=async url=>String(url).endsWith('capabilities')?json({apiVersion:4,features:["verifiedContacts","meetupLifecycle"]}):new Response('{broken',{headers:{'content-type':'application/json'}});
 await assert.rejects((await client()).api('/api/friends'),/некорректный ответ/);
 console.log('PASS: API compatibility gate, friendly HTML/network responses, valid profile JSON');
}finally{delete globalThis.window;}
