import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "../../..");
const serverDirectory = path.resolve(moduleDirectory, "..");

// Основной .env лежит в корне проекта. Второй путь оставлен для совместимости
// с уже настроенными локальными копиями проекта.
config({ path: path.resolve(projectRoot, ".env") });
config({ path: path.resolve(serverDirectory, ".env") });

