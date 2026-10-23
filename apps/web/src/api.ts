export const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "https://shodka-mvp-v2.onrender.com" : "http://localhost:3000")).replace(/\/$/, "");
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
  level?: "beginner" | "any" | "intermediate"; notificationsEnabled?: boolean; nickname?: string; telegramContact?: string; shareContact?: boolean; suspended?:boolean; moderationWarning?:string;
}
export const DEFAULT_USER_ID = "user-1";

const VERSION_MESSAGE = "Сайт обновлён, но сервер пока другой версии. Дождитесь обновления сервера и откройте приложение заново";
let checkedServer: Promise<void> | undefined;
export function verifyServer() {
  if (!checkedServer) checkedServer = (async()=>{
    let response: Response;
    try { response=await fetch(`${API_URL}/api/capabilities`,{cache:"no-store",signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error("Сервер недоступен или просыпается. Подождите немного и откройте приложение заново"); }
    if(!response.ok || !response.headers.get("content-type")?.includes("application/json"))throw new Error(VERSION_MESSAGE);
    const meta=await response.json().catch(()=>null);
    if(!meta || meta.apiVersion !== 4)throw new Error(VERSION_MESSAGE);
  })().catch(error=>{checkedServer=undefined;throw error;});
  return checkedServer;
}
export async function api<T>(path: string, options: RequestInit = {}, userId = DEFAULT_USER_ID): Promise<T> {
  await verifyServer();
  let response:Response;
  try { response=await fetch(`${API_URL}${path}`,{
    ...options, cache:"no-store", signal: options.signal ?? AbortSignal.timeout(25000),
    headers:{"content-type":"application/json","x-user-id":userId,...platformHeaders(),...options.headers},
  }); }catch{throw new Error("Не удалось связаться с сервером. Попробуйте ещё раз");}
  if(!response.headers.get("content-type")?.includes("application/json")) throw new Error(response.status>=500?"Сервер временно недоступен. Попробуйте позже":VERSION_MESSAGE);
  const body=await response.json().catch(()=>{throw new Error("Сервер вернул некорректный ответ. Попробуйте позже");});
  if(!response.ok)throw new Error(body.message??"Не удалось выполнить запрос");
  return body as T;
}
