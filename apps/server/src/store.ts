import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./types.js";

const configuredPath = process.env.DATA_FILE;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "../../..");
const dataFile = configuredPath
  ? path.resolve(projectRoot, configuredPath)
  : path.resolve(projectRoot, "data/db.json");
const seedFile = path.resolve(projectRoot, "data/seed.json");

let writeQueue: Promise<void> = Promise.resolve();
const demoAges: Record<string, number> = { "user-1": 18, "user-2": 25, "user-3": 16 };

function activityAgeGroup(minAge?: number, maxAge?: number): string {
  if (minAge !== undefined && maxAge !== undefined) return `${minAge}–${maxAge}`;
  if (minAge !== undefined) return `${minAge}+`;
  if (maxAge !== undefined) return `16–${maxAge}`;
  return "16+";
}

async function ensureDatabase(): Promise<void> {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.copyFile(seedFile, dataFile);
  }
}

export async function readDatabase(): Promise<Database> {
  await ensureDatabase();
  const content = await fs.readFile(dataFile, "utf8");
  const database = JSON.parse(content) as Database;
  return {
    ...database,
    users: database.users.map((user) => ({
      ...user,
      age: user.age ?? demoAges[user.id] ?? 16,
      ageGroup: "16+",
    })),
    activities: database.activities.map((activity) => ({
      ...activity,
      ageGroup: activityAgeGroup(activity.minAge, activity.maxAge),
    })),
  };
}

export async function writeDatabase(database: Database): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(database, null, 2), "utf8");
    await fs.rename(temporary, dataFile);
  });
  return writeQueue;
}
