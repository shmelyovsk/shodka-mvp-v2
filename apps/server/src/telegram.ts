import "./config.js";
import { handleSupportMessage, type SupportMessage } from "./support.js";

export async function telegram<T>(method: string, payload: object, signal?: AbortSignal): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Telegram не настроен");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), signal: signal ?? AbortSignal.timeout(15000),
  });
  const body = await response.json() as { ok: boolean; result: T; error_code?: number };
  if (!response.ok || !body.ok) throw new Error(`Telegram ${method}: ${body.error_code ?? response.status}`);
  return body.result;
}

export async function sendTelegramNotification(userId: string, text: string) {
  try { await telegram("sendMessage", { chat_id: userId, text }); }
  catch { console.error("Не удалось отправить уведомление Telegram"); }
}

export async function getTelegramConnectionStatus() {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  if (!configured) return { configured, connected: false };
  try {
    const bot = await telegram<{ id: number; username: string }>("getMe", {});
    return { configured, connected: true, bot: { id: bot.id, username: bot.username } };
  } catch { return { configured, connected: false }; }
}

interface Update { update_id: number; message?: SupportMessage }

export function startTelegramBot(): (() => void) | undefined {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_POLLING_ENABLED !== "true") return;
  const controller = new AbortController();
  let offset = 0;
  const run = async () => {
    try {
      await telegram("setMyCommands", { commands: [
        { command: "start", description: "Открыть Сходку" }, { command: "help", description: "Помощь" }, { command: "idea", description: "Предложить улучшение" }, { command: "cancel", description: "Отменить обращение" }, { command: "support", description: "Поддержать проект" }, {command:"id",description:"Мой ID для поддержки"},
      ] }, controller.signal);
    } catch { console.error("Не удалось настроить команды Telegram"); }
    while (!controller.signal.aborted) {
      try {
        const updates = await telegram<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, controller.signal);
        for (const update of updates) {
          const message = update.message;
          if(message?.chat.type === "private" && await handleSupportMessage(message)){offset=update.update_id+1;continue;}
          if (message?.chat.type === "private" && /^\/(start|help|support|id)(?:@\w+)?(?:\s|$)/.test(message.text ?? "")) {
            if (/^\/id(?:@\w+)?(?:\s|$)/.test(message.text??"")) {await telegram("sendMessage",{chat_id:message.chat.id,text:`Ваш ID СХОДКИ: telegram:${message.chat.id}`},controller.signal);offset=update.update_id+1;continue;}
            if (/^\/support(?:@\w+)?(?:\s|$)/.test(message.text ?? "")) {
              await telegram("sendMessage", { chat_id: message.chat.id, text: "«СХОДКА» бесплатна. Добровольная поддержка поможет нам оплачивать сервер и развивать приложение 💚\nСпособ оплаты пока готовим — никаких переводов сейчас делать не нужно." }, controller.signal);
              offset = update.update_id + 1; continue;
            }
            const url = process.env.MINI_APP_URL?.trim();
            await telegram("sendMessage", {
              chat_id: message.chat.id,
              text: "Привет! Это «Сходка» 👋\nНайди компанию для спорта и игр — на площадке, в клубе или онлайн.\nПрисоединяйся к встрече или собирай свою.",
              ...(url?.startsWith("https://") ? { reply_markup: { inline_keyboard: [[{ text: "Найти сходку", web_app: { url } }]] } } : {}),
            }, controller.signal);
          }
          offset = update.update_id + 1;
        }
      } catch {
        if (!controller.signal.aborted) {
          console.error("Ошибка получения событий Telegram. Проверьте токен и отсутствие webhook/второго polling");
          await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
            const timer = setTimeout(done, 5000);
            controller.signal.addEventListener("abort", done, { once: true });
          });
        }
      }
    }
  };
  void run();
  return () => controller.abort();
}
