import { sendMaxNotification } from "./max.js";
import { sendTelegramNotification } from "./telegram.js";

export async function sendNotification({ userId, text }: { userId: string; text: string }) {
  const match = /^(telegram|max):(\d+)$/.exec(userId);
  if (!match) return;
  if (match[1] === "telegram") await sendTelegramNotification(match[2], text);
  else await sendMaxNotification({ userId: match[2], text });
}
