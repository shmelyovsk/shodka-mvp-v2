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
    users: database.users.map((user) => ({ ...user, ageGroup: "16+" })),
    activities: database.activities.map((activity) => ({ ...activity, ageGroup: "16+" })),
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
