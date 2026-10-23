import "./config.js";
import cors from "cors";
import express from "express";
import { nanoid } from "nanoid";
import { readDatabase, writeDatabase, closeDatabase, checkDatabase, storageKind } from "./store.js";
import { getMaxConnectionStatus, startMaxBot } from "./max.js";
import { requestIdentity, demoEnabled } from "./auth.js";
import { sendNotification } from "./notifications.js";
import { startTelegramBot, getTelegramConnectionStatus } from "./telegram.js";
import { checkContent, ContentRejected, installModerationRoutes, isModerator } from "./moderation.js";
import { StorageConflict } from "./postgres.js";
import { installSocialRoutes, publicProfile, visibleActivity } from "./social.js";
import type { Activity, SkillLevel, User } from "./types.js";

import { installContactRoutes, syncTelegramContact, verifiedContact, CONTACT_REQUIRED } from "./contacts.js";
import { installSupportRoutes } from "./support.js";

import { installLifecycleRoutes, terminal, inFeed } from "./lifecycle.js";
import { timingSafeEqual } from "node:crypto";
import { startReminders, runReminders } from "./reminders.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "600kb" }));
const API_VERSION = 4;
app.get("/api/capabilities", (_req,res)=>res.set("Cache-Control","no-store").json({apiVersion:API_VERSION,features:["profiles","friends","games","reviews","moderation","support","verifiedContacts","meetupLifecycle"],release:"meetups-v4"}));
app.use("/api",(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
const resolvedUsers = new WeakMap<express.Request, string>();
// Serialize API operations in this process; PostgreSQL versions also protect across processes.
let operations = Promise.resolve();
app.use("/api", (req, res, next) => {
  const previous = operations;
  operations = new Promise<void>(release => { res.once("finish", release); });
  void previous.then(async () => {
    try {
      let identity: ReturnType<typeof requestIdentity>;
      try { identity = requestIdentity(req); }
      catch { return void res.status(401).json({ message: "Не удалось проверить вход. Откройте приложение заново через бота" }); }
      let userId = identity?.id;
      if (!identity && demoEnabled()) {
        const demoId = req.header("x-user-id") ?? "user-1";
        if (["user-1", "user-2", "user-3"].includes(demoId)) userId = demoId;
      }
      if (identity && req.method === "GET" && req.path === "/me") {
        const db = await readDatabase();
        const existing = db.users.find(user => user.id === identity.id);
        if (!existing) {
          let name=identity.name;try{checkContent(name);}catch(error){if(error instanceof ContentRejected)name="Участник";else throw error;}
          db.users.push({ id: identity.id, name, age: 0, ageGroup: "16+", avatarUrl: identity.avatarUrl, platformAvatarUrl: identity.avatarUrl, avatarSource: "platform", telegramContact: identity.telegramContact });
          await writeDatabase(db);
        } else if (existing.platformAvatarUrl !== identity.avatarUrl) {
          existing.platformAvatarUrl = identity.avatarUrl;
          if (existing.avatarSource !== "custom") { existing.avatarUrl = identity.avatarUrl; existing.avatarSource = "platform"; }
          await writeDatabase(db);
        }
      }
      if(identity?.platform === "telegram") {const db=await readDatabase();if(syncTelegramContact(db,identity.id,identity.telegramContact))await writeDatabase(db);}
      if (userId) resolvedUsers.set(req, userId);
      const publicRead = req.method === "GET" && (
        /^\/activities(?:\/[^/]+)?$/.test(req.path) || /^\/(max|telegram)\/status$/.test(req.path));
      if (!publicRead && !userId) return void res.status(401).json({ message: "Откройте Сходку через бота MAX или Telegram" });
      if (userId && req.method !== "GET" && req.path !== "/me" && !req.path.startsWith("/favorites") && req.path !== "/telegram-link") {
        const db = await readDatabase();
        const user = db.users.find(item => item.id === userId);
        if (!user || user.age < 16) return void res.status(403).json({ message: "Сначала укажите возраст в профиле (16+)" });
      }
      if(userId && !publicRead && req.path !== "/me" && !isModerator(userId)) {
        const db=await readDatabase();if(db.users.find(user=>user.id===userId)?.suspended)return void res.status(403).json({message:"Доступ ограничен модерацией. Проверьте уведомление в профиле"});
      }
      next();
    } catch (error) { next(error); }
  });
});

app.get("/api/me", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const user = db.users.find(item => item.id === userIdFromRequest(req));
    res.json({ moderator:isModerator(userIdFromRequest(req)), user:user?{...user,telegramContact:verifiedContact(user)?user.telegramContact:undefined}:user, demo: demoEnabled() && user?.id.startsWith("user-") });
  } catch (error) { next(error); }
});
app.patch("/api/me", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const user = db.users.find(item => item.id === userIdFromRequest(req));
    if (!user) return res.status(404).json({ message: "Профиль не найден" });
    const patch: Partial<User> = {};
    if ("age" in req.body) {
      const age = Number(req.body.age);
      if (!Number.isInteger(age) || age < 16 || age > 100) return res.status(400).json({ message: "Укажите возраст от 16 до 100 лет" });
      patch.age = age;
    }
    for (const [key, max] of [["name", 80], ["bio", 500], ["district", 100]] as const) {
      if (!(key in req.body)) continue;
      if (typeof req.body[key] !== "string" || req.body[key].trim().length > max || (key === "name" && !req.body[key].trim())) return res.status(400).json({ message: "Проверьте имя, описание и район" });
      patch[key] = req.body[key].trim();
    }
    if ("sports" in req.body) {
      if (!Array.isArray(req.body.sports) || req.body.sports.length > 12 || req.body.sports.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 50)) return res.status(400).json({ message: "Проверьте виды спорта" });
      patch.sports = [...new Set<string>(req.body.sports.map((item: string) => item.trim()))];
    }
    if ("level" in req.body) {
      if (!["beginner", "any", "intermediate"].includes(req.body.level)) return res.status(400).json({ message: "Выберите уровень подготовки" });
      patch.level = req.body.level;
    }
    if ("notificationsEnabled" in req.body) {
      if (typeof req.body.notificationsEnabled !== "boolean") return res.status(400).json({ message: "Некорректная настройка уведомлений" });
      patch.notificationsEnabled = req.body.notificationsEnabled;
    }
    if ("avatarUrl" in req.body) {
      if (typeof req.body.avatarUrl !== "string" || req.body.avatarUrl.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(req.body.avatarUrl)) return res.status(400).json({ message: "Загрузите фотографию JPG, PNG или WebP до 300 КБ" });
      patch.avatarUrl = req.body.avatarUrl; patch.avatarSource = "custom";
    }
    if (req.body.usePlatformAvatar === true) { patch.avatarUrl = user.platformAvatarUrl; patch.avatarSource = "platform"; }
    if ("nickname" in req.body) {
      if (typeof req.body.nickname !== "string") return res.status(400).json({ message: "Введите ник СХОДКИ" });
      const nickname = req.body.nickname.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z][a-z0-9_]{2,23}$/.test(nickname)) return res.status(400).json({ message: "Ник: 3–24 символа, латиница, цифры и _, первая буква латинская" });
      if (db.users.some(item => item.id !== user.id && item.nickname?.toLowerCase() === nickname)) return res.status(409).json({ message: "Этот ник уже занят" });
      patch.nickname = nickname;
    }
    if ("telegramContact" in req.body || "shareContact" in req.body || "telegramOwnerId" in req.body) return res.status(400).json({message:"Telegram-контакт нельзя менять в СХОДКЕ. Измените @username в Telegram и откройте приложение заново"});
    checkContent(patch.name, patch.bio, patch.nickname, patch.district, ...(patch.sports??[]));
    Object.assign(user, patch);
    await writeDatabase(db);
    res.json({ user:{...user,telegramContact:verifiedContact(user)?user.telegramContact:undefined} });
  } catch (error) { next(error); }
});
installModerationRoutes(app, userIdFromRequest);
installSupportRoutes(app, userIdFromRequest);
installContactRoutes(app, userIdFromRequest);
installSocialRoutes(app, userIdFromRequest);
installLifecycleRoutes(app, userIdFromRequest);

app.get("/api/telegram/status", async (_req, res) => { res.json(await getTelegramConnectionStatus()); });

function userIdFromRequest(req: express.Request): string {
  return String(resolvedUsers.get(req) ?? "");
}

function publicUser(db: Awaited<ReturnType<typeof readDatabase>>, user?: User) { return publicProfile(db, user); }

function participantsForActivity(db: Awaited<ReturnType<typeof readDatabase>>, activity: Activity) {
  const approvedUserIds = db.applications
    .filter((item) => item.activityId === activity.id && item.status === "approved")
    .map((item) => item.userId);
  const participantIds = new Set([activity.organizerId, ...approvedUserIds]);
  return db.users
    .filter((user) => participantIds.has(user.id))
    .map(({ id, name, age, avatarUrl }) => ({ id, name, age, avatarUrl }));
}

function optionalAge(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function ageLimitLabel(minAge?: number, maxAge?: number): string {
  if (minAge !== undefined && maxAge !== undefined) return `${minAge}–${maxAge}`;
  if (minAge !== undefined) return `${minAge}+`;
  if (maxAge !== undefined) return `16–${maxAge}`;
  return "16+";
}

app.get("/health", async (_req, res) => {
  try { await checkDatabase(); res.json({ status: "ok", service: "shodka-api", apiVersion:API_VERSION, release:"meetups-v4", commit:process.env.RENDER_GIT_COMMIT?.slice(0,7), storage: storageKind }); }
  catch { res.status(503).json({ status: "unavailable", service: "shodka-api", storage: storageKind }); }
});

app.post("/internal/reminders",async(req,res)=>{
 const secret=process.env.REMINDER_CRON_SECRET?.trim();if(!secret||secret.length<32)return void res.status(404).json({message:"Планировщик не настроен"});
 const input=req.header("authorization")??"",expected="Bearer "+secret;const a=Buffer.from(input),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return void res.status(401).json({message:"Недостаточно прав"});
 try{const sent=await runReminders(Date.now(),serializeBackground);res.json({ok:true,sent});}catch{res.status(503).json({message:"Повторите обработку позже"});}
});

app.get("/api/max/status", async (_req, res, next) => {
  try {
    res.json(await getMaxConnectionStatus());
  } catch (error) {
    next(error);
  }
});

app.get("/api/activities", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const sport = String(req.query.sport ?? "").toLowerCase();
    const district = String(req.query.district ?? "").toLowerCase();
    const level = String(req.query.level ?? "");
    const viewer = userIdFromRequest(req);
    const friends = new Set((db.friendships ?? []).filter(item => item.status === "accepted" && (item.from === viewer || item.to === viewer)).map(item => item.from === viewer ? item.to : item.from));
    const activities = db.activities
      .filter(item => req.query.friends !== "true" || friends.has(item.organizerId))
      .filter(item => !req.query.category || (item.category ?? "sport") === req.query.category)
      .filter((item) => item.status !== "cancelled" && !item.moderationHidden && !db.users.find(user=>user.id===item.organizerId)?.suspended)
      .filter((item) => inFeed(item))
      .filter((item) => !sport || item.sport.toLowerCase() === sport)
      .filter((item) => !district || item.district.toLowerCase().includes(district))
      .filter((item) => !level || item.level === level)
      .filter(item=>!req.query.format || (item.format??"offline")===req.query.format)
      .filter(item=>req.query.free!=="true"||(item.status==="open"&&item.approvedCount<item.capacity&&Date.parse(item.date)>Date.now()))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((activity) => {
        const item = visibleActivity(activity, false);
        return {
          ...item,
          organizer: publicUser(db, db.users.find((user) => user.id === activity.organizerId)),
          participants: participantsForActivity(db, activity),
        };
      });
    res.json(activities);
  } catch (error) {
    next(error);
  }
});

app.get("/api/activities/:id", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const activity = db.activities.find((item) => item.id === req.params.id);
    if (!activity) return res.status(404).json({ message: "Активность не найдена" });

    const userId = userIdFromRequest(req);
    const approved = db.applications.some(
      (item) => item.activityId === activity.id && item.userId === userId && item.status === "approved",
    );
    const maySeeAddress = approved || activity.organizerId === userId;
    if ((activity.moderationHidden || db.users.find(user=>user.id===activity.organizerId)?.suspended) && !maySeeAddress && !isModerator(userId)) return res.status(404).json({message:"Сходка недоступна"});
    const shownActivity = visibleActivity(activity, maySeeAddress);
    const ownApplication=db.applications.find(p=>p.activityId===activity.id&&p.userId===userId);
    res.json({
      relation:activity.organizerId===userId?"organizer":ownApplication?"participant":undefined, applicationStatus:ownApplication?.status,
      ...shownActivity,
      organizer: publicUser(db, db.users.find((user) => user.id === activity.organizerId)),
      participants: participantsForActivity(db, activity),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/activities", async (req, res, next) => {
  try {
    const organizerId = userIdFromRequest(req);
    if(!verifiedContact((await readDatabase()).users.find(u=>u.id===organizerId)))return res.status(400).json({message:CONTACT_REQUIRED});
    const category = req.body.category ?? "sport";
    const format = req.body.format ?? "offline";
    if (!["sport", "games"].includes(category) || !["offline", "online"].includes(format)) return res.status(400).json({ message: "Проверьте категорию и формат" });
    const required = ["title", "sport", "date", "level", "capacity", ...(format === "offline" ? ["district", "publicPlace"] : [])];
    const missing = required.filter((key) => !req.body[key]);
    if (missing.length) { const labels:Record<string,string>={title:"название",sport:"занятие",date:"дата и время",level:"уровень",capacity:"число участников",district:"район",publicPlace:category==="games"?"название клуба":"место встречи"}; return res.status(400).json({message:`Заполните поля: ${missing.map(key=>labels[key]??key).join(", ")}`}); }
    for (const [key, max] of [["title", 120], ["sport", 80], ["district", 100], ["publicPlace", 200], ["description", 2000], ["equipment", 300], ["exactAddress", 300], ["gamePlatform", 100]] as const) {
      if (req.body[key] !== undefined && (typeof req.body[key] !== "string" || req.body[key].length > max)) return res.status(400).json({ message: "Проверьте поля сходки: слишком длинный текст" });
    }
    if (!String(req.body.title).trim() || !String(req.body.sport).trim()) return res.status(400).json({ message: "Заполните название и занятие" });
    const capacity = Number(req.body.capacity), price = Number(req.body.price ?? 0);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100 || !Number.isFinite(price) || price < 0 || price > 100000 || !["beginner", "any", "intermediate"].includes(req.body.level)) return res.status(400).json({ message: "Проверьте число участников (2–100), цену и уровень" });
    let connectionLink: string | undefined;
    if (req.body.connectionLink) {
      try { const url = new URL(req.body.connectionLink); if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) throw new Error(); connectionLink = url.href; }
      catch { return res.status(400).json({ message: "Укажите корректную HTTPS-ссылку подключения" }); }
    }
    const activityDate = new Date(String(req.body.date));
    if (Number.isNaN(activityDate.getTime())) {
      return res.status(400).json({ message: "Укажите корректную дату и время" });
    }
    if (activityDate.getTime() <= Date.now()) {
      return res.status(400).json({ message: "Нельзя создать сходку на прошедшую дату" });
    }
    const minAge = optionalAge(req.body.minAge);
    const maxAge = optionalAge(req.body.maxAge);
    if (minAge !== undefined && (!Number.isInteger(minAge) || minAge < 16 || minAge > 100)) {
      return res.status(400).json({ message: "Минимальный возраст должен быть от 16 до 100 лет" });
    }
    if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 16 || maxAge > 100)) {
      return res.status(400).json({ message: "Максимальный возраст должен быть от 16 до 100 лет" });
    }
    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      return res.status(400).json({ message: "Минимальный возраст не может быть больше максимального" });
    }

    const db = await readDatabase();
    const organizer = db.users.find((item) => item.id === organizerId);
    if (!organizer) return res.status(404).json({ message: "Профиль организатора не найден" });
    if (minAge !== undefined && organizer.age < minAge) {
      return res.status(400).json({ message: `Ваш возраст меньше установленного минимума ${minAge} лет` });
    }
    if (maxAge !== undefined && organizer.age > maxAge) {
      return res.status(400).json({ message: `Ваш возраст больше установленного максимума ${maxAge} лет` });
    }

    checkContent(req.body.title,req.body.sport,req.body.description,req.body.publicPlace,req.body.district,req.body.gamePlatform,req.body.equipment);
    const activity: Activity = {
      id: nanoid(),
      title: String(req.body.title),
      sport: String(req.body.sport).trim(),
      category, format, connectionLink, gamePlatform: String(req.body.gamePlatform ?? ""),
      date: String(req.body.date),
      district: format === "online" ? "Онлайн" : String(req.body.district),
      publicPlace: format === "online" ? "Из дома" : String(req.body.publicPlace),
      exactAddress: format === "online" ? "" : String(req.body.exactAddress ?? req.body.publicPlace),
      level: req.body.level as SkillLevel,
      capacity,
      approvedCount: 1,
      price,
      equipment: category === "games" ? "" : String(req.body.equipment ?? "Не требуется"),
      description: String(req.body.description ?? ""),
      ageGroup: ageLimitLabel(minAge, maxAge),
      minAge,
      maxAge,
      organizerId,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    db.activities.push(activity);
    await writeDatabase(db);
    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
});

app.post("/api/activities/:id/applications", async (req, res, next) => {
  try {
    const userId = userIdFromRequest(req);
    const db = await readDatabase();
    const activity = db.activities.find((item) => item.id === req.params.id);
    if (!activity) return res.status(404).json({ message: "Активность не найдена" });
    if (new Date(activity.date).getTime() <= Date.now()) return res.status(409).json({ message: "Сходка уже прошла" });
    if (activity.moderationHidden || db.users.find(user=>user.id===activity.organizerId)?.suspended) return res.status(409).json({message:"Сходка скрыта модерацией"});
    if (activity.status !== "open") return res.status(409).json({ message: "Набор уже закрыт" });
    if (activity.organizerId === userId) return res.status(409).json({ message: "Организатор уже участвует" });
    const user = db.users.find((item) => item.id === userId);
    if (!user) return res.status(404).json({ message: "Профиль пользователя не найден" });
    if(!verifiedContact(user))return res.status(400).json({message:CONTACT_REQUIRED});
    if(!verifiedContact(db.users.find(u=>u.id===activity.organizerId)))return res.status(409).json({message:"Организатору нужно подтвердить Telegram-контакт в профиле перед приёмом заявок"});
    if (activity.minAge !== undefined && user.age < activity.minAge) {
      return res.status(409).json({ message: `Для этой сходки установлен возраст от ${activity.minAge} лет` });
    }
    if (activity.maxAge !== undefined && user.age > activity.maxAge) {
      return res.status(409).json({ message: `Для этой сходки установлен возраст до ${activity.maxAge} лет` });
    }
    const existing = db.applications.find((item) => item.activityId === activity.id && item.userId === userId);
    if (existing && existing.status !== "withdrawn") return res.status(409).json({ message: "Заявка уже отправлена" });

    const application = {
      id: existing?.id ?? nanoid(),
      activityId: activity.id,
      userId,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    if(existing)Object.assign(existing,application);else db.applications.push(application);
    await writeDatabase(db);
    await sendNotification({ userId: activity.organizerId, text: `Новая заявка на «${activity.title}»` });
    res.status(201).json(application);
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/:userId/activities", async (req, res, next) => {
  try {
    if (req.params.userId !== userIdFromRequest(req)) return res.status(403).json({ message: "Недостаточно прав" });
    const db = await readDatabase();
    const applications = db.applications.filter((item) => item.userId === req.params.userId);
    const appliedIds = new Set(applications.map((item) => item.activityId));
    const activities = db.activities
      .filter((item) => item.organizerId === req.params.userId || appliedIds.has(item.id))
      .map((activity) => {
        const applicationStatus = applications.find((item) => item.activityId === activity.id)?.status;
        const isOrganizer = activity.organizerId === req.params.userId;
        const maySeeAddress = isOrganizer || applicationStatus === "approved";
        const shownActivity = visibleActivity(activity, maySeeAddress);
        return {
          ...shownActivity,
          organizer: publicUser(db, db.users.find((user) => user.id === activity.organizerId)),
          participants: participantsForActivity(db, activity),
          relation: isOrganizer ? "organizer" : "participant",
          applicationStatus,
        };
      });
    res.json(activities);
  } catch (error) {
    next(error);
  }
});

app.get("/api/organizers/:userId/applications", async (req, res, next) => {
  try {
    if (req.params.userId !== userIdFromRequest(req)) return res.status(403).json({ message: "Недостаточно прав" });
    const db = await readDatabase();
    const activityIds = new Set(db.activities.filter((item) => item.organizerId === req.params.userId).map((item) => item.id));
    const results = db.applications
      .filter((item) => activityIds.has(item.activityId))
      .map((application) => ({
        ...application,
        activity: db.activities.find((item) => item.id === application.activityId),
        user: publicUser(db, db.users.find((item) => item.id === application.userId)),
      }));
    res.json(results);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/applications/:id", async (req, res, next) => {
  try {
    const organizerId = userIdFromRequest(req);
    const status = String(req.body.status);
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: "Некорректный статус" });

    const db = await readDatabase();
    const application = db.applications.find((item) => item.id === req.params.id);
    if (!application) return res.status(404).json({ message: "Заявка не найдена" });
    const activity = db.activities.find((item) => item.id === application.activityId);
    if (!activity || activity.organizerId !== organizerId) return res.status(403).json({ message: "Недостаточно прав" });
    if(application.status==="withdrawn")return res.status(409).json({message:"Участник отозвал заявку. Дождитесь новой заявки"});
    if (terminal(activity) || new Date(activity.date).getTime() <= Date.now()) return res.status(409).json({ message: "Сходка завершена или отменена" });
    if(status==="approved"&&(!verifiedContact(db.users.find(u=>u.id===organizerId))||!verifiedContact(db.users.find(u=>u.id===application.userId))))return res.status(409).json({message:"Перед одобрением организатор и участник должны подтвердить Telegram-контакты в профиле"});
    if (status === "approved" && application.status !== "approved" && activity.approvedCount >= activity.capacity) {
      return res.status(409).json({ message: "Все места уже заняты" });
    }

    if (application.status === "approved" && status !== "approved") activity.approvedCount -= 1;
    if (application.status !== "approved" && status === "approved") activity.approvedCount += 1;
    application.status = status as "approved" | "rejected";
    activity.status = activity.approvedCount >= activity.capacity ? "full" : "open";
    await writeDatabase(db);
    await sendNotification({
      userId: application.userId,
      text: status === "approved" ? `Ваша заявка на «${activity.title}» подтверждена` : `Заявка на «${activity.title}» отклонена`,
    });
    res.json(application);
  } catch (error) {
    next(error);
  }
});

app.post("/api/activities/:id/cancel", async (req, res, next) => {
  try {
    const organizerId = userIdFromRequest(req);
    const db = await readDatabase();
    const activity = db.activities.find((item) => item.id === req.params.id);
    if (!activity) return res.status(404).json({ message: "Активность не найдена" });
    if (activity.organizerId !== organizerId) return res.status(403).json({ message: "Недостаточно прав" });
    if(terminal(activity))return res.status(409).json({message:"Встреча уже завершена или отменена"});
    if(Date.parse(activity.date)<=Date.now())return res.status(409).json({message:"Встреча уже началась. Укажите её итог"});
    activity.status = "cancelled";
    await writeDatabase(db);
    await Promise.all(db.applications.filter(item => item.activityId === activity.id && item.status === "approved").map(item => sendNotification({ userId: item.userId, text: `Сходка «${activity.title}» отменена` })));
    res.json(activity);
  } catch (error) {
    next(error);
  }
});

app.use("/api",(_req,res)=>{res.status(404).json({message:"Этот раздел недоступен в текущей версии сервера. Обновите сервер приложения"});});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ContentRejected) return void res.status(400).json({message:error.message});
  if (error instanceof StorageConflict) return void res.status(409).json({ message: error.message });
  console.error("API operation failed");
  res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

try { await readDatabase(); }
catch { console.error("Storage initialization failed. Check DATABASE_URL and database access"); await closeDatabase(); process.exit(1); }
console.log(`Storage: ${storageKind}`);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Shodka API listening on ${port}`);
});

const stopMaxBot = startMaxBot();
const stopTelegramBot = startTelegramBot();
async function serializeBackground<T>(task:()=>Promise<T>):Promise<T>{const previous=operations;let release!:()=>void;operations=new Promise<void>(resolve=>{release=resolve;});await previous;try{return await task();}finally{release();}}
const stopReminders = process.env.REMINDERS_ENABLED === "false" ? undefined : startReminders(serializeBackground);

function shutdown() {
  stopReminders?.();
  stopMaxBot?.();
  stopTelegramBot?.();
  server.close(() => { void closeDatabase().finally(() => process.exit(0)); });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
