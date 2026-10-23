import type { Activity } from "./types";
export type HistoryTab = "upcoming" | "past" | "cancelled";
const moscowDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export function activityPhase(activity: Activity, now = new Date()): "upcoming" | "started" | "past" | "cancelled" {
  if (activity.status === "cancelled") return "cancelled";
  const start = new Date(activity.date);
  if (start > now) return "upcoming";
  return moscowDay(start) === moscowDay(now) ? "started" : "past";
}
export function inHistoryTab(activity: Activity, tab: HistoryTab, now = new Date()) {
  const phase = activityPhase(activity, now);
  return tab === "upcoming" ? phase === "upcoming" || phase === "started" : phase === tab;
}
