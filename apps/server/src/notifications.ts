import { readDatabase } from "./store.js";
import { sendMaxNotification } from "./max.js";
import { sendTelegramNotification } from "./telegram.js";

export async function sendNotification({ userId, text }: { userId: string; text: string }) {
  const db = await readDatabase();
  if (db.users.find(user => user.id === userId)?.notificationsEnabled === false) return;
  const match = /^(telegram|max):(\d+)$/.exec(userId);
  if (!match) return;
  if (match[1] === "telegram") await sendTelegramNotification(match[2], text);
  else await sendMaxNotification({ userId: match[2], text });
}

export async function sendReminder(userId:string,text:string):Promise<boolean>{
 const db=await readDatabase();if(db.users.find(u=>u.id===userId)?.notificationsEnabled===false)return false;
 const match=/^(telegram|max):(\d+)$/.exec(userId);if(!match)return false;
 if(match[1]==="telegram"){const {telegram}=await import("./telegram.js");await telegram("sendMessage",{chat_id:match[2],text});return true;}
 const token=process.env.MAX_BOT_TOKEN?.trim();if(!token)return false;
 const base=(process.env.MAX_BOT_API_URL?.trim()||"https://platform-api2.max.ru").replace(/\/$/,"");const response=await fetch(base+"/messages?user_id="+match[2],{method:"POST",headers:{Authorization:token,"content-type":"application/json"},body:JSON.stringify({text}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error("MAX reminder delivery failed");return true;
}
