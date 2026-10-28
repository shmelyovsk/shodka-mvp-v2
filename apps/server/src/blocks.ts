import type {Express} from "express";
import type {Database} from "./types.js";
import {readDatabase,writeDatabase} from "./store.js";
import {sendNotification} from "./notifications.js";

export function blockedBetween(db:Database,a:string,b:string){return (db.blocks??[]).some(item=>item.from===a&&item.to===b||item.from===b&&item.to===a);}
export function installBlockRoutes(app:Express,currentUser:(req:import("express").Request)=>string){
 app.get("/api/blocks",async(req,res,next)=>{try{const db=await readDatabase(),viewer=currentUser(req);res.json((db.blocks??[]).filter(b=>b.from===viewer).map(b=>{const u=db.users.find(u=>u.id===b.to);return {userId:b.to,name:u?.name??"Участник",nickname:u?.nickname,createdAt:b.createdAt};}));}catch(e){next(e);}});
 app.post("/api/blocks/:id",async(req,res,next)=>{try{
  const db=await readDatabase(),viewer=currentUser(req),target=String(req.params.id);
  if(viewer===target)return void res.status(400).json({message:"Нельзя заблокировать себя"});
  if(!db.users.some(u=>u.id===target))return void res.status(404).json({message:"Пользователь не найден"});
  const ids=req.body?.excludeActivityIds??[];
  if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=="string"))return void res.status(400).json({message:"Проверьте список встреч"});
  const excluded=[...new Set<string>(ids)];
  for(const id of excluded){const a=db.activities.find(a=>a.id===id);if(!a||a.organizerId!==viewer||!["open","full"].includes(a.status)||Date.parse(a.date)<=Date.now()||!db.applications.some(p=>p.activityId===id&&p.userId===target&&p.status==="approved"))return void res.status(409).json({message:"Исключить можно только принятого участника своей предстоящей сходки. Обновите профиль."});}
  if(!(db.blocks??=[]).some(b=>b.from===viewer&&b.to===target))db.blocks.push({from:viewer,to:target,createdAt:new Date().toISOString()});
  db.friendships=(db.friendships??[]).filter(f=>!(f.from===viewer&&f.to===target||f.from===target&&f.to===viewer));
  for(const p of db.applications){const a=db.activities.find(a=>a.id===p.activityId);if(!a||!["open","full"].includes(a.status)||Date.parse(a.date)<=Date.now())continue;
   if(p.status==="pending"&&a.organizerId===viewer&&p.userId===target)p.status="rejected";
   if(p.status==="pending"&&a.organizerId===target&&p.userId===viewer)p.status="withdrawn";
   if(excluded.includes(a.id)&&p.userId===target&&p.status==="approved"){p.status="rejected";a.approvedCount=1+db.applications.filter(other=>other.activityId===a.id&&other.status==="approved").length;a.status=a.approvedCount>=a.capacity?"full":"open";}
  }
  await writeDatabase(db);
  await Promise.all(excluded.map(id=>sendNotification({userId:target,text:`Организатор отменил ваше участие в сходке «${db.activities.find(a=>a.id===id)!.title}». Место освобождено.`})));
  res.json({ok:true,excludedActivityIds:excluded});
 }catch(e){next(e);}});
 app.delete("/api/blocks/:id",async(req,res,next)=>{try{const db=await readDatabase();db.blocks=(db.blocks??[]).filter(b=>b.from!==currentUser(req)||b.to!==req.params.id);await writeDatabase(db);res.json({ok:true});}catch(e){next(e);}});
}
