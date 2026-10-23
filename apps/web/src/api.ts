export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
type Bridge = { initData?: string; ready?: () => void; expand?: () => void };
declare global { interface Window { Telegram?: { WebApp?: Bridge }; WebApp?: Bridge } }
export function platformHeaders(): Record<string, string> {
  const telegram = window.Telegram?.WebApp;
  const max = window.WebApp;
  const bridge = telegram?.initData ? telegram : max;
  bridge?.ready?.();
  if (telegram?.initData) return { "x-platform": "telegram", "x-init-data": telegram.initData };
  const maxData = max?.initData || new URLSearchParams(window.location.hash.slice(1)).get("WebAppData");
  if (maxData) return { "x-platform": "max", "x-init-data": maxData };
  return {};
}
export interface Profile {
  id: string; name: string; age: number; avatarUrl?: string; platformAvatarUrl?: string;
  avatarSource?: "platform" | "custom"; bio?: string; district?: string; sports?: string[];
  level?: "beginner" | "any" | "intermediate"; notificationsEnabled?: boolean; nickname?: string; telegramContact?: string; shareContact?: boolean;
}
export const DEFAULT_USER_ID = "user-1";

export async function api<T>(path: string, options: RequestInit = {}, userId = DEFAULT_USER_ID): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      ...platformHeaders(),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Не удалось выполнить запрос");
  return body as T;
}
