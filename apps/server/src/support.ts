import type { Express } from "express";
import { nanoid } from "nanoid";
import { readDatabase, writeDatabase } from "./store.js";
import { isModerator } from "./moderation.js";
import { telegram } from "./telegram.js";
export interface SupportMessage {from?:{username?:string};message_id?:number;text?:string;caption?:string;photo?:{file_id:string}[];document?:{file_id:string;mime_type?:string;file_size?:number};chat:{id:number;type:string}}
export async function handleSupportMessage(message:SupportMessage):Promise<boolean>{
 const chat=message.chat.id,id="telegram:"+chat,text=(message.text??message.caption??"").trim();
 const send=(text:string,extra:object={})=>telegram("sendMessage",{chat_id:chat,text,...extra});
 const remove={reply_markup:{remove_keyboard:true}};
 if(/^\/help(?:@\w+)?(?:\s|$)/.test(text)){
  const db=await readDatabase();if(db.supportDrafts?.[id]){delete db.supportDrafts[id];await writeDatabase(db);}
  await send("Помощь СХОДКИ. Выберите, что вам нужно. Жалобы на участников и публикации отправляйте из мини-приложения.",{reply_markup:{keyboard:[[{text:"Как пользоваться"}],[{text:"Сообщить о проблеме"}],[{text:"Предложить улучшение"}]],resize_keyboard:true}});return true;
 }
 if(text==="Как пользоваться") {await send("Найдите встречу в «Сходках» и подайте заявку. После одобрения откройте её подробности и доступные контакты. Во вкладке «Создать» можно собрать свою встречу. Заявки к вам находятся в «Моих», а друзей можно найти по нику СХОДКИ во вкладке «Друзья». Возраст и данные о себе заполните в профиле по аватарке справа вверху.");return true;}
 const kind=/^\/idea(?:@\w+)?(?:\s|$)/.test(text)||text==="Предложить улучшение"?"idea":text==="Сообщить о проблеме"?"problem":undefined;
 if(kind){const db=await readDatabase();(db.supportDrafts??={})[id]=kind;await writeDatabase(db);await send(kind==="idea"?"Чего вам не хватает в СХОДКЕ? Отправьте идею одним сообщением. Можно приложить скриншот с подписью. Отмена: /cancel.":"Опишите проблему одним сообщением. Можно приложить скриншот с подписью. Не отправляйте пароли, коды входа и платёжные данные. Отмена: /cancel.",remove);return true;}
 if(/^\/(cancel|start)(?:@\w+)?(?:\s|$)/.test(text)){const db=await readDatabase();if(db.supportDrafts?.[id]){delete db.supportDrafts[id];await writeDatabase(db);}if(text.startsWith("/cancel")){await send("Отправка отменена.",remove);return true;}return false;}
 if(text.startsWith("/"))return false;
 const db=await readDatabase(),draft=db.supportDrafts?.[id];
 if(!draft){await send("Для помощи и сообщения о проблеме нажмите /help. Для предложения улучшения — /idea.");return true;}
 if(text.length>3000){await send("Сократите сообщение до 3000 символов и отправьте ещё раз.");return true;}
 if(!text){await send("Добавьте описание к скриншоту и отправьте его снова одним сообщением.");return true;}
 if(message.document&&(!message.document.mime_type?.startsWith("image/")||(message.document.file_size??0)>10000000)){await send("Можно приложить изображение до 10 МБ или отправить только текст.");return true;}
 const tickets=db.supportTickets??=[],recent=tickets.filter(t=>t.userId===id&&Date.now()-Date.parse(t.createdAt)<3600000);
 if(recent.length>=5){await send("Вы уже отправили 5 обращений за час. Попробуйте позже. Отмена: /cancel.");return true;}
 const duplicate=tickets.find(t=>t.userId===id&&t.sourceMessageId===message.message_id);
 if(!duplicate){const attachment=message.photo?.length?{kind:"photo" as const,fileId:message.photo.at(-1)!.file_id}:message.document?{kind:"document" as const,fileId:message.document.file_id}:undefined;
 const ticket={id:nanoid(8),userId:id,kind:draft,text,createdAt:new Date().toISOString(),status:"new" as const,sourceMessageId:message.message_id??0,attachment,replies:[]};tickets.push(ticket);delete db.supportDrafts![id];await writeDatabase(db);await send((draft==="idea"?"Предложение получено":"Обращение получено")+". Номер: "+ticket.id+". Ответ придёт сюда, в бот. Срок ответа пока не обещаем.",remove);}return true;
}
export function installSupportRoutes(app:Express,currentUser:(req:import("express").Request)=>string){
 app.use("/api/support",(req,res,next)=>{if(!isModerator(currentUser(req)))return void res.status(403).json({message:"Доступ только для команды поддержки"});next();});
 app.get("/api/support",async(_req,res,next)=>{try{const db=await readDatabase();res.json((db.supportTickets??[]).map(t=>({...t,attachment:t.attachment?{kind:t.attachment.kind}:undefined,name:db.users.find(u=>u.id===t.userId)?.name??t.userId})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));}catch(e){next(e);}});
 app.patch("/api/support/:id",async(req,res,next)=>{try{const db=await readDatabase(),ticket=db.supportTickets?.find(t=>t.id===req.params.id);if(!ticket)return void res.status(404).json({message:"Обращение не найдено"});if(!["new","working","resolved"].includes(req.body.status))return void res.status(400).json({message:"Неизвестный статус"});ticket.status=req.body.status;(ticket.changes??=[]).push({moderatorId:currentUser(req),status:ticket.status,createdAt:new Date().toISOString()});await writeDatabase(db);res.json({ok:true});}catch(e){next(e);}});
 app.post("/api/support/:id/attachment",async(req,res,next)=>{try{const moderator=currentUser(req);if(!moderator.startsWith("telegram:"))return void res.status(400).json({message:"Откройте панель через Telegram для получения скриншота"});const db=await readDatabase(),ticket=db.supportTickets?.find(t=>t.id===req.params.id);if(!ticket?.attachment)return void res.status(404).json({message:"Вложение не найдено"});const a=ticket.attachment;await telegram(a.kind==="photo"?"sendPhoto":"sendDocument",{chat_id:moderator.slice(9),[a.kind==="photo"?"photo":"document"]:a.fileId,caption:"Обращение №"+ticket.id});res.json({ok:true});}catch(e){res.status(502).json({message:"Не удалось отправить скриншот. Сначала напишите /start нашему боту"});}});
 app.post("/api/support/:id/replies",async(req,res,next)=>{try{const text=req.body.text;if(typeof text!=="string"||!text.trim()||text.length>3000)return void res.status(400).json({message:"Ответ должен содержать от 1 до 3000 символов"});let db=await readDatabase();const ticket=db.supportTickets?.find(t=>t.id===req.params.id);if(!ticket)return void res.status(404).json({message:"Обращение не найдено"});const reply={id:nanoid(),text:text.trim(),moderatorId:currentUser(req),createdAt:new Date().toISOString(),delivery:"pending" as "pending"|"sent"|"failed"};ticket.replies.push(reply);await writeDatabase(db);
 let delivered=true;try{await telegram("sendMessage",{chat_id:ticket.userId.slice(9),text:"Ответ команды СХОДКИ на обращение №"+ticket.id+"\n\n"+reply.text+"\n\nДля нового обращения: /help. Для предложения: /idea."});}catch{delivered=false;}
 db=await readDatabase();const saved=db.supportTickets?.find(t=>t.id===ticket.id)?.replies.find(r=>r.id===reply.id);if(saved){saved.delivery=delivered?"sent":"failed";await writeDatabase(db);}if(!delivered)return void res.status(502).json({message:"Ответ сохранён, но Telegram не доставил его. Проверьте историю перед повторной отправкой"});res.json({ok:true});}catch(e){next(e);}});
}
