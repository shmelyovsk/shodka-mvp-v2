import "./config.js";
import { Bot, Context, Keyboard } from "@maxhub/max-bot-api";

export interface Notification {
  userId: string;
  text: string;
}

interface MaxBotInfo {
  user_id: number;
  first_name: string;
  username?: string | null;
  is_bot: boolean;
}

const DEFAULT_API_URL = "https://platform-api2.max.ru";

let activeBot: Bot | undefined;

function maxConfig() {
  return {
    token: process.env.MAX_BOT_TOKEN?.trim(),
    apiUrl: (process.env.MAX_BOT_API_URL?.trim() || DEFAULT_API_URL).replace(/\/$/, ""),
  };
}

export async function getMaxConnectionStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  bot?: Pick<MaxBotInfo, "user_id" | "first_name" | "username">;
  message: string;
}> {
  const { token, apiUrl } = maxConfig();
  if (!token) {
    return { configured: false, connected: false, message: "Токен MAX не настроен" };
  }

  try {
    const response = await fetch(`${apiUrl}/me`, {
      headers: { Authorization: token },
    });
    if (!response.ok) {
      return {
        configured: true,
        connected: false,
        message: response.status === 401 ? "MAX отклонил токен" : `MAX API вернул ${response.status}`,
      };
    }
    const bot = await response.json() as MaxBotInfo;
    return {
      configured: true,
      connected: true,
      bot: { user_id: bot.user_id, first_name: bot.first_name, username: bot.username },
      message: "Подключение к MAX работает",
    };
  } catch (error) {
    console.error("MAX connection check failed", error);
    return { configured: true, connected: false, message: "Не удалось связаться с MAX API" };
  }
}

export async function sendMaxNotification(notification: Notification): Promise<void> {
  const { token, apiUrl } = maxConfig();

  if (!token) {
    console.info("[MAX mock notification]", notification);
    return;
  }

  // Демонстрационные идентификаторы user-1/user-2 не являются ID пользователей MAX.
  if (!/^\d+$/.test(notification.userId)) {
    console.info("[MAX demo user: notification skipped]", notification);
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/messages?user_id=${encodeURIComponent(notification.userId)}`, {
      method: "POST",
      headers: {
        Authorization: token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: notification.text }),
    });
    if (!response.ok) {
      console.error(`MAX notification failed: ${response.status}`, await response.text());
    }
  } catch (error) {
    // Уведомление не должно ломать основное действие пользователя.
    console.error("MAX notification request failed", error);
  }
}

function welcomeMessage(): string {
  return [
    "Привет! Это «Сходка» — сервис для совместных занятий спортом.",
    "",
    "Здесь можно найти тренировку рядом, присоединиться к участникам или создать собственную активность.",
    "",
    "Сервис предназначен для пользователей 16+. Встречайтесь в общественных местах и не публикуйте точный адрес открыто.",
  ].join("\n");
}

function welcomeExtra() {
  const miniAppUrl = process.env.MINI_APP_URL?.trim();
  if (!miniAppUrl?.startsWith("https://")) return undefined;

  return {
    attachments: [
      Keyboard.inlineKeyboard([
        [Keyboard.button.openApp("Открыть Сходку", miniAppUrl)],
      ]),
    ],
  };
}

export function startMaxBot(): (() => void) | undefined {
  const { token } = maxConfig();
  const pollingEnabled = process.env.MAX_BOT_POLLING_ENABLED !== "false";

  if (!token || !pollingEnabled || activeBot) return undefined;

  const bot = new Bot(token);
  activeBot = bot;

  const sendWelcome = async (ctx: Context) => {
    await ctx.reply(welcomeMessage(), welcomeExtra());
  };

  bot.on("bot_started", sendWelcome);
  bot.command("start", sendWelcome);
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Команды:\n/start — открыть приветствие\n/help — показать справку",
      welcomeExtra(),
    );
  });

  bot.catch((error) => {
    console.error("MAX bot update failed", error);
  });

  void bot.api.setMyCommands([
    { name: "start", description: "Открыть Сходку" },
    { name: "help", description: "Помощь" },
  ]).catch((error) => console.error("MAX bot commands setup failed", error));

  void bot.start({
    mode: "polling",
    options: {
      allowedUpdates: ["bot_started", "message_created"],
      retry: true,
    },
  }).catch((error) => console.error("MAX bot polling failed", error));

  console.log("MAX bot long polling started");

  return () => {
    bot.stopPolling();
    activeBot = undefined;
  };
}
