import {blockedBetween} from "./blocks.js";
import { mayReview, terminal } from "./lifecycle.js";
import { verifiedContact } from "./contacts.js";
import { checkContent, isModerator } from "./moderation.js";
import type { Express } from "express";
import { nanoid } from "nanoid";
import { readDatabase, writeDatabase } from "./store.js";
import type { Activity, Database, User } from "./types.js";

export function ratingFor(db: Database, userId: string) {
  const reviews = (db.reviews ?? []).filter(item => item.targetId === userId && !item.hidden);
  return { rating: reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.score, 0) / reviews.length * 10) / 10 : undefined, reviewsCount: reviews.length };
}
export function publicProfile(db: Database, user?: User) {
  if (!user) return undefined;
  if(user.suspended)return {id:user.id,name:"Профиль недоступен",age:0,ageGroup:"16+",rating:undefined,reviewsCount:0};
  const { id, name, nickname, age, ageGroup, avatarUrl, bio, district, sports } = user;
  return { id, name, nickname, age, ageGroup, avatarUrl, bio, district, sports, ...ratingFor(db, id) };
}
export function friendshipBetween(db: Database, a: string, b: string) {
  return (db.friendships ?? []).find(item => item.from === a && item.to === b || item.from === b && item.to === a);
}
export function approvedIn(db: Database, activity: Activity, userId: string) {
  return activity.organizerId === userId || db.applications.some(item => item.activityId === activity.id && item.userId === userId && item.status === "approved");
}
export function canSeeContact(db: Database, viewer: string, target: User) {
  if (viewer === target.id) return true;
  if(blockedBetween(db,viewer,target.id))return false;
  if (target.suspended || db.users.find(user=>user.id===viewer)?.suspended) return false;
  if (!verifiedContact(target)) return false;
  if (friendshipBetween(db, viewer, target.id)?.status === "accepted") return true;
  return db.activities.some(activity => activity.status !== "cancelled" && activity.status !== "not_held" && !activity.moderationHidden &&
    (activity.organizerId === viewer && approvedIn(db, activity, target.id) || activity.organizerId === target.id && approvedIn(db, activity, viewer)));
}
export function visibleActivity(activity: Activity, allowed: boolean) {
  const { exactAddress, connectionLink, ...rest } = activity;
  return allowed ? activity : rest;
}
export function installSocialRoutes(app: Express, currentUser: (req: import("express").Request) => string) {
  app.get("/api/people", async (req, res, next) => {
    try {
      const query = String(req.query.q ?? "").trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(query)) return res.status(400).json({ message: "Введите хотя бы 3 символа ника СХОДКИ" });
      const db = await readDatabase();
      res.json(db.users.filter(user => !user.suspended && !blockedBetween(db,currentUser(req),user.id) && user.age >= 16 && user.nickname?.startsWith(query) && user.id !== currentUser(req)).slice(0, 30).map(user => publicProfile(db, user)));
    } catch (error) { next(error); }
  });
  app.get("/api/friends", async (req, res, next) => {
    try {
      const db = await readDatabase(); const viewer = currentUser(req);
      res.json((db.friendships ?? []).filter(item => item.from === viewer || item.to === viewer).map(item => ({
        ...item, incoming: item.to === viewer,
        user: publicProfile(db, db.users.find(user => user.id === (item.from === viewer ? item.to : item.from))),
      })));
    } catch (error) { next(error); }
  });
  app.post("/api/friends", async (req, res, next) => {
    try {
      const db = await readDatabase(); const viewer = currentUser(req); const target = String(req.body.userId ?? "");
      if (!db.users.find(user => user.id === viewer)?.nickname) return res.status(400).json({ message: "Сначала выберите ник СХОДКИ в профиле" });
      if(blockedBetween(db,viewer,target))return res.status(403).json({message:"Запрос в друзья этому пользователю недоступен"});
      if (viewer === target) return res.status(400).json({ message: "Это ваш профиль" });
      if (!db.users.some(user => user.id === target && user.age >= 16 && user.nickname)) return res.status(404).json({ message: "Пользователь с заполненным профилем не найден" });
      if (friendshipBetween(db, viewer, target)) return res.status(409).json({ message: "Запрос уже существует. Проверьте входящие" });
      const item = { id: nanoid(), from: viewer, to: target, status: "pending" as const, createdAt: new Date().toISOString() };
      (db.friendships ??= []).push(item); await writeDatabase(db); res.status(201).json(item);
    } catch (error) { next(error); }
  });
  app.patch("/api/friends/:id", async (req, res, next) => {
    try {
      const db = await readDatabase(); const item = (db.friendships ?? []).find(item => item.id === req.params.id);
      if (!item || item.to !== currentUser(req)) return res.status(403).json({ message: "Принять запрос может только получатель" });
      if(blockedBetween(db,item.from,item.to))return res.status(403).json({message:"Принять запрос нельзя: действует блокировка"});
      if (req.body.status !== "accepted") return res.status(400).json({ message: "Некорректный статус" });
      item.status = "accepted"; await writeDatabase(db); res.json(item);
    } catch (error) { next(error); }
  });
  app.delete("/api/friends/:id", async (req, res, next) => {
    try {
      const db = await readDatabase(); const viewer = currentUser(req); const item = (db.friendships ?? []).find(item => item.id === req.params.id);
      if (!item || item.from !== viewer && item.to !== viewer) return res.status(403).json({ message: "Недостаточно прав" });
      db.friendships = db.friendships!.filter(other => other.id !== item.id); await writeDatabase(db); res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.get("/api/profiles/:id", async (req, res, next) => {
    try {
      const db = await readDatabase(); const viewer = currentUser(req); const user = db.users.find(item => item.id === req.params.id);
      if (!user || user.suspended && currentUser(req)!==user.id && !isModerator(currentUser(req))) return res.status(404).json({ message: "Профиль не найден" });
      const relation = friendshipBetween(db, viewer, user.id);
      const allReviews = (db.reviews ?? []).filter(item => item.targetId === user.id);
      const reviews = allReviews.filter(item=>!item.hidden).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const eligibleActivities = db.activities.filter(activity => mayReview(activity) &&
        viewer !== user.id && approvedIn(db, activity, viewer) && approvedIn(db, activity, user.id) &&
        !allReviews.some(review => review.authorId === viewer && review.activityId === activity.id))
        .map(activity => ({ id: activity.id, title: activity.title, date: activity.date }));
      res.json({ user: publicProfile(db, user),
        blockedByMe:(db.blocks??[]).some(b=>b.from===viewer&&b.to===user.id),interactionBlocked:blockedBetween(db,viewer,user.id),
        excludableActivities:db.activities.filter(a=>a.organizerId===viewer&&["open","full"].includes(a.status)&&Date.parse(a.date)>Date.now()&&db.applications.some(p=>p.activityId===a.id&&p.userId===user.id&&p.status==="approved")).map(a=>({id:a.id,title:a.title})),
        contact: canSeeContact(db, viewer, user) && user.telegramContact ? { telegram: user.telegramContact } : null,
        friendship: relation ? { id: relation.id, status: relation.status, incoming: relation.to === viewer } : null,
        activities: db.activities.filter(activity => activity.organizerId === user.id && !terminal(activity) && new Date(activity.date).getTime() > Date.now()).sort((a,b) => a.date.localeCompare(b.date)).map(activity => visibleActivity(activity, false)),
        reviews: reviews.slice(0, 50).map(review => ({ ...review, activityTitle: db.activities.find(activity => activity.id === review.activityId)?.title, author: publicProfile(db, db.users.find(item => item.id === review.authorId)) })),
        eligibleActivities,
      });
    } catch (error) { next(error); }
  });
  app.post("/api/reviews", async (req, res, next) => {
    try {
      const db = await readDatabase(); const viewer = currentUser(req);
      const activity = db.activities.find(item => item.id === req.body.activityId); const target = String(req.body.userId ?? "");
      if (!activity || activity.status === "cancelled" || activity.status === "not_held" || viewer === target || !approvedIn(db, activity, viewer) || !approvedIn(db, activity, target)) return res.status(403).json({ message: "Отзыв доступен только участникам общей подтверждённой встречи" });
      if (!mayReview(activity)) return res.status(409).json({ message: "Отзыв можно оставить после того, как организатор отметит встречу состоявшейся" });
      if (req.body.attended !== true) return res.status(400).json({ message: "Подтвердите, что вы встретились" });
      const score = Number(req.body.score); const text = req.body.text ?? "";
      if (!Number.isInteger(score) || score < 1 || score > 5 || typeof text !== "string" || text.length > 500) return res.status(400).json({ message: "Оценка от 1 до 5, текст до 500 символов" });
      if ((db.reviews ?? []).some(item => item.activityId === activity.id && item.authorId === viewer && item.targetId === target)) return res.status(409).json({ message: "Вы уже оценили этого человека за эту встречу" });
      checkContent(text);
      const review = { id: nanoid(), activityId: activity.id, authorId: viewer, targetId: target, score, text: text.trim(), attended: true as const, createdAt: new Date().toISOString() };
      (db.reviews ??= []).push(review); await writeDatabase(db); res.status(201).json(review);
    } catch (error) { next(error); }
  });
}
