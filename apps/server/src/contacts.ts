import {createHash,randomBytes} from "node:crypto";
import type {Express} from "express";
import type {Database,User} from "./types.js";
import {readDatabase,writeDatabase} from "./store.js";
import {telegram} from "./telegram.js";
export function syncTelegramContact(db:Database,ownerId:string,username?:string){
 const valid=username&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)?username:undefined;
 let changed=false;for(const user of db.users.filter(u=>u.id===ownerId||u.telegramOwnerId===ownerId))if(user.telegramContact!==valid||user.telegramOwnerId!==ownerId){user.telegramContact=valid;user.telegramOwnerId=ownerId;changed=true;}return changed;
}
export async function refreshTelegramContacts(ownerId:string,username?:string){const db=await readDatabase();if(syncTelegramContact(db,ownerId,username))await writeDatabase(db);}
export function verifiedContact(user?:User){return Boolean(user?.telegramContact&&user.telegramOwnerId?.startsWith("telegram:"));}
export function missingProfileFields(user?:User){
 const missing:string[]=[];
 if(!user?.name?.trim())missing.push("имя");
 if(!user?.nickname||!/^[a-z][a-z0-9_]{2,23}$/.test(user.nickname))missing.push("ник СХОДКИ");
 if(!user||!Number.isInteger(user.age)||user.age<16||user.age>100)missing.push("возраст от 16 лет");
 if(!verifiedContact(user))missing.push("подтверждённый Telegram-контакт");
 return missing;
}
export const CONTACT_REQUIRED="Для обмена контактами установите имя пользователя @username в Telegram и заново откройте приложение. В MAX сначала привяжите Telegram в профиле.";
export async function acceptTelegramLink(text:string,chatId:number,username?:string){
 const match=/^\/start(?:@\w+)?\s+link_([A-Za-z0-9_-]{40,50})$/.exec(text);if(!match)return false;
 const db=await readDatabase(),hash=createHash("sha256").update(match[1]).digest("hex"),link=db.telegramLinks?.find(l=>l.hash===hash&&Date.parse(l.expiresAt)>Date.now());
 let result="Ссылка недействительна или истекла. Создайте новую в профиле СХОДКИ.";
 if(link){if(!username||!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)){await telegram("sendMessage",{chat_id:chatId,text:"Сначала установите @username в настройках Telegram, затем ещё раз откройте эту ссылку."});return true;}
 const user=db.users.find(u=>u.id===link.userId);if(user){user.telegramOwnerId="telegram:"+chatId;user.telegramContact=username;db.telegramLinks=db.telegramLinks!.filter(l=>l.hash!==hash);syncTelegramContact(db,"telegram:"+chatId,username);await writeDatabase(db);result="Telegram привязан. Вернитесь в профиль СХОДКИ и нажмите «Обновить контакт». Контакт увидят друзья и участники после одобрения.";}}
 await telegram("sendMessage",{chat_id:chatId,text:result});return true;
}
export function installContactRoutes(app:Express,currentUser:(req:import("express").Request)=>string){app.post("/api/telegram-link",async(req,res,next)=>{try{const id=currentUser(req);if(!id.startsWith("max:"))return void res.status(400).json({message:"В Telegram контакт обновляется при повторном открытии приложения"});const bot=await telegram<{username:string}>("getMe",{});if(!/^[A-Za-z0-9_]+$/.test(bot.username))throw Error("Bot username missing");const token=randomBytes(32).toString("base64url"),db=await readDatabase();db.telegramLinks=(db.telegramLinks??[]).filter(l=>l.userId!==id&&Date.parse(l.expiresAt)>Date.now());db.telegramLinks.push({hash:createHash("sha256").update(token).digest("hex"),userId:id,expiresAt:new Date(Date.now()+600000).toISOString()});await writeDatabase(db);res.json({url:"https://t.me/"+bot.username+"?start=link_"+token});}catch(e){next(e);}});}
