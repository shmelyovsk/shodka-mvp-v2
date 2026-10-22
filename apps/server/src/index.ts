import "./config.js";
import cors from "cors";
import express from "express";
import { nanoid } from "nanoid";
import { readDatabase, writeDatabase } from "./store.js";
import { getMaxConnectionStatus, startMaxBot } from "./max.js";
import { requestIdentity, demoEnabled } from "./auth.js";
import { sendNotification } from "./notifications.js";
import { startTelegramBot, getTelegramConnectionStatus } from "./telegram.js";
import type { Activity, SkillLevel } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true }));
app.use(express.json());
const resolvedUsers = new WeakMap<express.Request, string>();
// Serialize complete API operations while the MVP uses one JSON file.
let operations = Promise.resolve();
app.use("/api", (req, res, next) => {
  const previous = operations;
  operations = new Promise<void>(release => { res.once("finish", release); });
  void previous.then(async () => {
    try {
      const identity = requestIdentity(req);
      let userId = identity?.id;
      if (!identity && demoEnabled()) {
        const demoId = req.header("x-user-id") ?? "user-1";
        if (["user-1", "user-2", "user-3"].includes(demoId)) userId = demoId;
      }
      if (identity && req.method === "GET" && req.path === "/me") {
        const db = await readDatabase();
        if (!db.users.some(user => user.id === identity.id)) {
          db.users.push({ id: identity.id, name: identity.name, age: 0, ageGroup: "16+" });
          await writeDatabase(db);
        }
      }
      if (userId) resolvedUsers.set(req, userId);
      const publicRead = req.method === "GET" && (
        /^\/activities(?:\/[^/]+)?$/.test(req.path) || /^\/(max|telegram)\/status$/.test(req.path));
      if (!publicRead && !userId) return void res.status(401).json({ message: "Откройте Сходку через бота MAX или Telegram" });
      if (userId && !publicRead && req.path !== "/me") {
        const db = await readDatabase();
        const user = db.users.find(item => item.id === userId);
        if (!user || user.age < 16) return void res.status(403).json({ message: "Сначала укажите возраст в профиле (16+)" });
      }
      next();
    } catch {
      res.status(401).json({ message: "Не удалось проверить вход. Откройте приложение заново через бота" });
    }
  });
});

app.get("/api/me", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const user = db.users.find(item => item.id === userIdFromRequest(req));
    res.json({ user, demo: demoEnabled() && user?.id.startsWith("user-") });
  } catch (error) { next(error); }
});
app.patch("/api/me", async (req, res, next) => {
  try {
    const age = Number(req.body.age);
    if (!Number.isInteger(age) || age < 16 || age > 100) return res.status(400).json({ message: "Укажите возраст от 16 до 100 лет" });
    const db = await readDatabase();
    const user = db.users.find(item => item.id === userIdFromRequest(req));
    if (!user) return res.status(404).json({ message: "Профиль не найден" });
    user.age = age;
    await writeDatabase(db);
    res.json({ user });
  } catch (error) { next(error); }
});
app.get("/api/telegram/status", async (_req, res) => { res.json(await getTelegramConnectionStatus()); });

function userIdFromRequest(req: express.Request): string {
  return String(resolvedUsers.get(req) ?? "");
}

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "shodka-api" });
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
    const activities = db.activities
      .filter((item) => item.status !== "cancelled")
      .filter((item) => new Date(item.date).getTime() >= Date.now())
      .filter((item) => !sport || item.sport.toLowerCase() === sport)
      .filter((item) => !district || item.district.toLowerCase().includes(district))
      .filter((item) => !level || item.level === level)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((activity) => {
        const { exactAddress: _hidden, ...item } = activity;
        return {
          ...item,
          organizer: db.users.find((user) => user.id === activity.organizerId),
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
    const { exactAddress, ...publicActivity } = activity;
    const visibleActivity = maySeeAddress ? activity : publicActivity;
    res.json({
      ...visibleActivity,
      organizer: db.users.find((user) => user.id === activity.organizerId),
      participants: participantsForActivity(db, activity),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/activities", async (req, res, next) => {
  try {
    const organizerId = userIdFromRequest(req);
    const required = ["title", "sport", "date", "district", "publicPlace", "level", "capacity"];
    const missing = required.filter((key) => !req.body[key]);
    if (missing.length) return res.status(400).json({ message: `Заполните поля: ${missing.join(", ")}` });
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

    const activity: Activity = {
      id: nanoid(),
      title: String(req.body.title),
      sport: String(req.body.sport),
      date: String(req.body.date),
      durationMinutes: Number(req.body.durationMinutes ?? 60),
      district: String(req.body.district),
      publicPlace: String(req.body.publicPlace),
      exactAddress: String(req.body.exactAddress ?? req.body.publicPlace),
      level: req.body.level as SkillLevel,
      capacity: Math.max(2, Number(req.body.capacity)),
      approvedCount: 1,
      price: Math.max(0, Number(req.body.price ?? 0)),
      equipment: String(req.body.equipment ?? "Не требуется"),
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
    if (activity.status !== "open") return res.status(409).json({ message: "Набор уже закрыт" });
    if (activity.organizerId === userId) return res.status(409).json({ message: "Организатор уже участвует" });
    const user = db.users.find((item) => item.id === userId);
    if (!user) return res.status(404).json({ message: "Профиль пользователя не найден" });
    if (activity.minAge !== undefined && user.age < activity.minAge) {
      return res.status(409).json({ message: `Для этой сходки установлен возраст от ${activity.minAge} лет` });
    }
    if (activity.maxAge !== undefined && user.age > activity.maxAge) {
      return res.status(409).json({ message: `Для этой сходки установлен возраст до ${activity.maxAge} лет` });
    }
    const existing = db.applications.find((item) => item.activityId === activity.id && item.userId === userId);
    if (existing) return res.status(409).json({ message: "Заявка уже отправлена" });

    const application = {
      id: nanoid(),
      activityId: activity.id,
      userId,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    db.applications.push(application);
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
      .filter((item) => item.status !== "cancelled")
      .filter((item) => new Date(item.date).getTime() >= Date.now())
      .filter((item) => item.organizerId === req.params.userId || appliedIds.has(item.id))
      .map((activity) => {
        const applicationStatus = applications.find((item) => item.activityId === activity.id)?.status;
        const isOrganizer = activity.organizerId === req.params.userId;
        const maySeeAddress = isOrganizer || applicationStatus === "approved";
        const { exactAddress, ...publicActivity } = activity;
        return {
          ...(maySeeAddress ? activity : publicActivity),
          organizer: db.users.find((user) => user.id === activity.organizerId),
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
        user: db.users.find((item) => item.id === application.userId),
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
    if (activity.status === "cancelled" || new Date(activity.date).getTime() <= Date.now()) return res.status(409).json({ message: "Сходка завершена или отменена" });
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
    activity.status = "cancelled";
    await writeDatabase(db);
    await Promise.all(db.applications.filter(item => item.activityId === activity.id && item.status === "approved").map(item => sendNotification({ userId: item.userId, text: `Сходка «${activity.title}» отменена` })));
    res.json(activity);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Shodka API listening on ${port}`);
});

const stopMaxBot = startMaxBot();
const stopTelegramBot = startTelegramBot();

function shutdown() {
  stopMaxBot?.();
  stopTelegramBot?.();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
