import type {Express} from "express";
import {readDatabase,writeDatabase} from "./store.js";
import {mayReview} from "./lifecycle.js";
import {approvedIn,publicProfile,friendshipBetween} from "./social.js";
import {blockedBetween} from "./blocks.js";
export function installAfterMeetingRoutes(app:Express,currentUser:(req:import("express").Request)=>string){
 app.get("/api/after-meetings",async(req,res,next)=>{try{const db=await readDatabase(),viewer=currentUser(req);res.json(db.activities.filter(a=>mayReview(a)&&!a.moderationHidden&&approvedIn(db,a,viewer)&&!(db.meetingFeedback??[]).some(f=>f.userId===viewer&&f.activityId===a.id)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(a=>({id:a.id,title:a.title,date:a.date})));}catch(e){next(e);}});
 app.post("/api/activities/:id/feedback",async(req,res,next)=>{try{
  const db=await readDatabase(),viewer=currentUser(req),a=db.activities.find(a=>a.id===req.params.id);
  if(!a||!approvedIn(db,a,viewer)||a.moderationHidden)return void res.status(403).json({message:"Ответить могут только участники общей подтверждённой встречи"});
  if(!mayReview(a))return void res.status(409).json({message:"Обратная связь доступна после отметки организатора «Состоялась»"});
  if(typeof req.body?.met!=="boolean")return void res.status(400).json({message:"Укажите, удалось ли встретиться"});
  const old=(db.meetingFeedback??=[]).find(f=>f.userId===viewer&&f.activityId===a.id);
  if(old)old.met=req.body.met;else db.meetingFeedback.push({userId:viewer,activityId:a.id,met:req.body.met,createdAt:new Date().toISOString()});
  await writeDatabase(db);
  res.json({met:req.body.met,people:req.body.met?db.users.filter(u=>u.id!==viewer&&!u.suspended&&approvedIn(db,a,u.id)&&!blockedBetween(db,viewer,u.id)).map(u=>({...publicProfile(db,u),friendship:friendshipBetween(db,viewer,u.id)?.status??null,reviewed:(db.reviews??[]).some(r=>r.activityId===a.id&&r.authorId===viewer&&r.targetId===u.id)})):[]});
 }catch(e){next(e);}});
}
