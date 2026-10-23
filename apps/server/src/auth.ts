import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export type Platform = "telegram" | "max";
export interface Identity { id: string; name: string; platform: Platform; platformUserId: string; avatarUrl?: string; telegramContact?: string }

export function validateInitData(platform: Platform, raw: string, token: string, now = Date.now()): Identity {
  if (!token || !raw || raw.length > 16000) throw new Error("Данные входа отсутствуют");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error("Повторяющиеся параметры входа");
  const hash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Некорректная подпись");
  params.delete("hash");
  const data = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new Error("Неверная подпись");
  const date = Number(params.get("auth_date"));
  if (!Number.isInteger(date) || date <= 0 || now / 1000 - date > 86400 || date - now / 1000 > 60) {
    throw new Error("Время входа истекло. Откройте приложение заново");
  }
  const user = JSON.parse(params.get("user") ?? "null");
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== "string") {
    throw new Error("Некорректный профиль");
  }
  const avatarUrl = typeof user.photo_url === "string" && user.photo_url.startsWith("https://") && user.photo_url.length <= 2048 ? user.photo_url : undefined;
  return { avatarUrl, telegramContact: platform === "telegram" && typeof user.username === "string" && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(user.username) ? user.username : undefined, id: `${platform}:${user.id}`, platform, platformUserId: String(user.id),
    name: [user.first_name, typeof user.last_name === "string" ? user.last_name : ""].filter(Boolean).join(" ").slice(0, 120) };
}

export function requestIdentity(req: Request): Identity | undefined {
  const platform = req.header("x-platform");
  const raw = req.header("x-init-data");
  if (!platform && !raw) return undefined;
  if (platform !== "telegram" && platform !== "max") throw new Error("Неизвестная платформа");
  const token = process.env[platform === "telegram" ? "TELEGRAM_BOT_TOKEN" : "MAX_BOT_TOKEN"]?.trim() ?? "";
  return validateInitData(platform, raw ?? "", token);
}

export function demoEnabled() {
  return process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}
