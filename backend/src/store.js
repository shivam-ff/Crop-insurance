import { promises as fs } from "fs";
import path from "path";

const dataDir = path.resolve(process.cwd(), "data");
const usersFile = path.join(dataDir, "users.json");

async function ensure() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(usersFile);
  } catch {
    await fs.writeFile(usersFile, JSON.stringify({ users: [] }, null, 2), "utf8");
  }
}

export async function readUsers() {
  await ensure();
  const raw = await fs.readFile(usersFile, "utf8");
  const json = JSON.parse(raw);
  return Array.isArray(json?.users) ? json.users : [];
}

export async function writeUsers(users) {
  await ensure();
  await fs.writeFile(usersFile, JSON.stringify({ users }, null, 2), "utf8");
}

