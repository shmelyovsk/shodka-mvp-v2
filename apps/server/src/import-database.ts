import "./config.js";
import { readFile } from "node:fs/promises";
import { closeDatabase, importDatabase } from "./store.js";
import type { Database } from "./types.js";

try {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Set DATABASE_URL first");
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run db:import --workspace @shodka/server -- /absolute/path/backup.json");
  const data = JSON.parse(await readFile(file, "utf8")) as Database;
  for (const key of ["users", "activities", "applications"] as const) {
    if (!Array.isArray(data[key])) throw new Error(`Invalid backup: ${key}`);
    const ids = data[key].map(item => item?.id);
    if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
      throw new Error(`Invalid or duplicate IDs: ${key}`);
    }
  }
  const users = new Set(data.users.map(user => user.id));
  const activities = new Set(data.activities.map(activity => activity.id));
  if (data.users.some(user => typeof user.name !== "string" || !Number.isInteger(user.age) || user.age < 0 || user.age > 100)
    || data.activities.some(activity => !users.has(activity.organizerId))
    || data.applications.some(item => !users.has(item.userId) || !activities.has(item.activityId))) {
    throw new Error("Invalid backup: profiles or references");
  }
  await importDatabase(data);
  console.log(`Imported ${data.users.length} users, ${data.activities.length} activities, ${data.applications.length} applications`);
} catch (error) {
  // Connection failures may include private connection details. Do not print them.
  console.error(error instanceof Error && /^(Set |Usage:|Invalid |Import refused)/.test(error.message)
    ? error.message : "Import failed. Check connection and backup format");
  process.exitCode = 1;
} finally { await closeDatabase(); }
