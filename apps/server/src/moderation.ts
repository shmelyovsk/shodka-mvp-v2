import type { Express } from "express";
import { nanoid } from "nanoid";
import { readDatabase, writeDatabase } from "./store.js";
import type { ContentReport, Database } from "./types.js";

export class ContentRejected extends Error {}
export function checkContent(...values: unknown[]) {
  const raw = values.filter(value => typeof value === "string").join(" ").normalize("NFKC").toLowerCase().replace(/ё/g,"е").replace(/[\u200b-\u200f\ufeff]/g,"");
  // Conservative baseline. Reports and human review handle context and evasions.
  const latin = /(?:^|[^a-z])(?:fuck\w*|shit\w*|bitch\w*)(?:$|[^a-z])/i;
  const map: Record<string,string> = {x:"х",y:"у",e:"е",a:"а",o:"о",c:"с",p:"р",k:"к",m:"м",t:"т",0:"о",3:"з"};
  const ru = /[а-я]/.test(raw) ? raw.replace(/[xyeaocpkmt03]/g,char=>map[char]??char) : raw;
  const compact = ru.replace(/(?<=\p{L})[._*\-]+(?=\p{L})/gu,"").replace(/х\s+у\s+й/gu,"хуй");
  const explicit = /(?:^|[^\p{L}\p{N}])(?:хуй\p{L}*|ху[ея]\p{L}*|пизд\p{L}*|бляд\p{L}*|бля(?:ть)?|еб[аун]\p{L}*|уеб\p{L}*|долбоеб\p{L}*)(?=$|[^\p{L}\p{N}])/u;
  const threat = /(?:(?:убью|изобью|зарежу)\s+(?:тебя|вас|его|ее)|(?:тебя|вас|его|ее)\s+(?:убью|изобью|зарежу))/u;
  if (latin.test(raw) || explicit.test(compact) || threat.test(compact)) throw new ContentRejected("В тексте найдены грубые выражения или угроза. Переформулируйте сообщение");
}
export function isModerator(userId: string) {
  return (process.env.MODERATOR_USER_IDS ?? "").split(",").map(value=>value.trim()).filter(Boolean).includes(userId);
}
function reportsFor(db: Database) {
  const reports = db.contentReports ??= [];
  for(const old of db.reviewReports??[]) if(!reports.some(item=>item.id===old.id)) reports.push({id:old.id,kind:"review",targetId:old.reviewId,reporterId:old.reporterId,reason:old.reason,createdAt:old.createdAt,status:"open"});
  return reports;
}
export function installModerationRoutes(app: Express, currentUser: (req: import("express").Request)=>string) {
  const report = (fixedKind?: "review") => async (req: import("express").Request,res:import("express").Response,next:import("express").NextFunction) => {
    try {
      const db=await readDatabase(); const kind=fixedKind??req.body.kind;
      const targetId=fixedKind?String(req.params.id):String(req.body.targetId??"");
      if(!["activity","user","review"].includes(kind)) return res.status(400).json({message:"Выберите объект жалобы"});
      const exists=kind==="activity"?db.activities.some(item=>item.id===targetId):kind==="user"?db.users.some(item=>item.id===targetId):(db.reviews??[]).some(item=>item.id===targetId);
      if(!exists)return res.status(404).json({message:"Объект жалобы не найден"});
      const reason=req.body.reason;
      if(typeof reason!=="string"||!reason.trim()||reason.length>500)return res.status(400).json({message:"Укажите причину жалобы до 500 символов"});
      const reports=reportsFor(db);const viewer=currentUser(req);
      if(reports.some(item=>item.kind===kind&&item.targetId===targetId&&item.reporterId===viewer))return res.status(409).json({message:"Жалоба уже отправлена"});
      reports.push({id:nanoid(),kind,targetId,reporterId:viewer,reason:reason.trim(),createdAt:new Date().toISOString(),status:"open"});
      await writeDatabase(db);res.status(201).json({ok:true});
    }catch(error){next(error);}
  };
  app.post("/api/reports",report());
  app.post("/api/reviews/:id/report",report("review"));
  app.get("/api/moderation",async(req,res,next)=>{
    try{
      if(!isModerator(currentUser(req)))return res.status(403).json({message:"Доступ только для команды модерации"});
      const db=await readDatabase();
      res.json(reportsFor(db).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(item=>{
        const review=(db.reviews??[]).find(review=>review.id===item.targetId);
        const activity=db.activities.find(activity=>activity.id===item.targetId);
        const ownerId=item.kind==="user"?item.targetId:item.kind==="activity"?activity?.organizerId:review?.authorId;
        const owner=db.users.find(user=>user.id===ownerId);
        return {...item,ownerId,ownerName:owner?.name,ownerNickname:owner?.nickname,ownerSuspended:owner?.suspended??false,ownerWarning:Boolean(owner?.moderationWarning),
          content:item.kind==="activity"?`${activity?.title??""}\n${activity?.description??""}`:item.kind==="review"?review?.text:owner?.bio,
          hidden:item.kind==="activity"?activity?.moderationHidden:item.kind==="review"?review?.hidden:owner?.suspended,
          protectedOwner:ownerId?isModerator(ownerId):false};
      }));
    }catch(error){next(error);}
  });
  app.patch("/api/moderation/:id",async(req,res,next)=>{
    try{
      const viewer=currentUser(req);if(!isModerator(viewer))return res.status(403).json({message:"Недостаточно прав"});
      const action=String(req.body.action);
      if(!["hide","restore","warn","suspend","unsuspend","clearwarning","dismiss"].includes(action))return res.status(400).json({message:"Неизвестное действие"});
      const db=await readDatabase();const report=reportsFor(db).find(item=>item.id===req.params.id);
      if(!report)return res.status(404).json({message:"Жалоба не найдена"});
      const activity=report.kind==="activity"?db.activities.find(item=>item.id===report.targetId):undefined;
      const review=report.kind==="review"?(db.reviews??[]).find(item=>item.id===report.targetId):undefined;
      const ownerId=report.kind==="user"?report.targetId:activity?.organizerId??review?.authorId;
      const owner=db.users.find(item=>item.id===ownerId);
      if(["suspend","unsuspend","warn","clearwarning"].includes(action)&&(!owner||isModerator(owner.id)))return res.status(400).json({message:"Нельзя изменить доступ аккаунта команды модерации"});
      if(action==="hide"||action==="restore"){
        if(!activity&&!review)return res.status(400).json({message:"Для профиля используйте предупреждение или блокировку"});
        if(activity)activity.moderationHidden=action==="hide";
        if(review)review.hidden=action==="hide";
      }
      if(action==="suspend")owner!.suspended=true;
      if(action==="unsuspend")owner!.suspended=false;
      if(action==="clearwarning")owner!.moderationWarning=undefined;
      if(action==="warn")owner!.moderationWarning="Модерация получила жалобу. Проверьте ваши публикации и соблюдайте уважительное общение.";
      report.status="resolved";report.resolution=action;
      (db.moderationLog??=[]).push({id:nanoid(),reportId:report.id,moderatorId:viewer,action,createdAt:new Date().toISOString()});
      await writeDatabase(db);res.json({ok:true});
    }catch(error){next(error);}
  });
}
