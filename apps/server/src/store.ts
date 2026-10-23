import "./config.js";
import pg from "pg";
import { createPostgresStore } from "./postgres.js";
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

const connectionString = process.env.DATABASE_URL?.trim();
const pool = connectionString ? new pg.Pool({ connectionString, max: 3,
  connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, query_timeout: 15000 }) : undefined;
pool?.on("error", () => console.error("PostgreSQL: idle connection error"));
const postgres = pool ? createPostgresStore(pool) : undefined;
export const storageKind = postgres ? "postgres" : "json";
export async function closeDatabase() { await pool?.end(); }
export async function checkDatabase() {
  if (pool) await pool.query("SELECT 1");
  else await readDatabase();
}
export async function importDatabase(database: Database) {
  if (!postgres) throw new Error("DATABASE_URL must be set for import");
  await postgres.importIntoEmpty(database);
}

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
  if (postgres) return postgres.read();
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
  if (postgres) return postgres.write(database);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(database, null, 2), "utf8");
    // Windows may briefly lock the destination while another reader or antivirus closes it.
    for(let attempt=0;;attempt++){
      try{await fs.rename(temporary,dataFile);break;}
      catch(error){const code=(error as NodeJS.ErrnoException).code;if(process.platform!=="win32"||attempt>=5||!["EPERM","EACCES","EBUSY"].includes(code??""))throw error;await new Promise(resolve=>setTimeout(resolve,20*2**attempt));}
    }
  });
  return writeQueue;
}
