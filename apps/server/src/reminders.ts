import {readDatabase,writeDatabase} from "./store.js";
import {sendReminder} from "./notifications.js";
import {terminal} from "./lifecycle.js";
import type {Database} from "./types.js";
type Serialize=<T>(task:()=>Promise<T>)=>Promise<T>;
export async function runReminders(now=Date.now(),serialize:Serialize=task=>task(),send=sendReminder){
 const startedWall=Date.now();
 const candidates=await serialize(async()=>{const db=await readDatabase(),result:{key:string;activityId:string;userId:string;window:"day"|"hour"}[]=[];
 for(const a of db.activities){if(terminal(a)||a.moderationHidden||db.users.find(u=>u.id===a.organizerId)?.suspended)continue;const remaining=Date.parse(a.date)-now;
 // Grace windows catch a short restart without sending yesterday's reminder just before the meeting.
 const window=remaining>23*3600000&&remaining<=24*3600000?"day":remaining>0&&remaining<=3600000?"hour":undefined;if(!window)continue;
 const recipients=new Set([a.organizerId,...db.applications.filter(p=>p.activityId===a.id&&p.status==="approved").map(p=>p.userId)]);
 for(const userId of recipients){const u=db.users.find(u=>u.id===userId);if(!u||u.suspended||u.notificationsEnabled===false)continue;const key=a.id+":"+userId+":"+window,old=db.reminderDeliveries?.find(d=>d.key===key);if(old&&(old.state==="sent"||old.state==="skipped"||old.attempts>=3||now-Date.parse(old.claimedAt)<300000))continue;result.push({key,activityId:a.id,userId,window});}}return result;});
 let sent=0;
 for(const candidate of candidates.slice(0,100)){
  const claimNow=now+Date.now()-startedWall;
  const claimed=await serialize(async()=>{const db=await readDatabase(),a=db.activities.find(a=>a.id===candidate.activityId),u=db.users.find(u=>u.id===candidate.userId);if(!a||terminal(a)||a.moderationHidden||Date.parse(a.date)<=claimNow||!u||u.suspended||u.notificationsEnabled===false||!(a.organizerId===u.id||db.applications.some(p=>p.activityId===a.id&&p.userId===u.id&&p.status==="approved")))return false;
  const deliveries=db.reminderDeliveries??=[],old=deliveries.find(d=>d.key===candidate.key);if(old&&(old.state==="sent"||old.state==="skipped"||old.attempts>=3||claimNow-Date.parse(old.claimedAt)<300000))return false;
  if(old){old.state="sending";old.claimedAt=new Date(claimNow).toISOString();old.attempts++;}else deliveries.push({...candidate,state:"sending",claimedAt:new Date(claimNow).toISOString(),attempts:1});await writeDatabase(db);return true;});
  if(!claimed)continue;let state:"sent"|"failed"|"skipped"="failed";
  try{const db=await readDatabase(),a=db.activities.find(a=>a.id===candidate.activityId)!,u=db.users.find(u=>u.id===candidate.userId);if(!a||Date.parse(a.date)<=now+Date.now()-startedWall||terminal(a)||a.moderationHidden||!u||u.suspended||u.notificationsEnabled===false||!(a.organizerId===u.id||db.applications.some(p=>p.activityId===a.id&&p.userId===u.id&&p.status==="approved"))){await serialize(async()=>{const latest=await readDatabase(),d=latest.reminderDeliveries?.find(d=>d.key===candidate.key);if(d){d.state="skipped";await writeDatabase(latest);}});continue;}const time=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(a.date));const place=a.format==="online"?"Онлайн":a.publicPlace+", "+a.district;const text=(candidate.window==="day"?"Завтра встречаемся":"Скоро встречаемся")+": «"+a.title+"»\n"+time+" (Москва)\n"+place+"\nОткройте сходку в «Моих», чтобы посмотреть подробности и контакт организатора.";state=await send(candidate.userId,text)?"sent":"skipped";if(state==="sent")sent++;}catch{state="failed";}
  await serialize(async()=>{const db=await readDatabase(),d=db.reminderDeliveries?.find(d=>d.key===candidate.key);if(d){d.state=state;await writeDatabase(db);}});
 }
 return sent;
}
export function startReminders(serialize:Serialize){let busy=false;const tick=async()=>{if(busy)return;busy=true;try{await runReminders(Date.now(),serialize);}catch{console.error("Не удалось обработать напоминания");}finally{busy=false;}};void tick();const timer=setInterval(()=>void tick(),60000);timer.unref();return()=>clearInterval(timer);}
