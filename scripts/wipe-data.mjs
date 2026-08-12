// Wipes ALL data from the configured database, keeping only the admin account
// (and its sessions). Reads DATABASE_URL from .env. Destructive — intended for
// clearing test data before going live.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(resolve(root, ".env"), "utf8");
const m = envText.match(/^DATABASE_URL\s*=\s*"(.*)"\s*$/m);
if (m) process.env.DATABASE_URL = m[1];
const ADMIN_EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL || (envText.match(/^BOOTSTRAP_ADMIN_EMAIL\s*=\s*"(.*)"/m)?.[1]) || "admin@company.in").toLowerCase();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Child → parent order so NoAction foreign keys are never violated.
const ORDER = [
  "auditLog", "notification", "annotation", "vote", "minutesComment", "minutesAddendum",
  "actionItem", "boardPackSection", "conflictDeclaration", "announcement", "resolution",
  "minutes", "boardPack", "document", "agendaItem", "attendance", "meeting",
  "committeeMember", "committee", "folder", "retentionPolicy", "appSetting",
];

const COUNT_MODELS = [...ORDER, "session", "user"];

async function counts() {
  const out = {};
  for (const m of COUNT_MODELS) out[m] = await prisma[m].count();
  return out;
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  console.log(`Datasource: ${process.env.DATABASE_URL?.replace(/password=\{[^}]*\}/, "password={***}")}`);
  console.log(`Admin to preserve: ${admin ? `${admin.email} (id ${admin.id})` : "NOT FOUND — will be recreated on next login"}`);

  const before = await counts();
  console.log("\nBefore:", JSON.stringify(before));
  const total = Object.values(before).reduce((a, b) => a + b, 0);
  console.log(`Total rows before: ${total}`);

  for (const model of ORDER) {
    const res = await prisma[model].deleteMany({});
    if (res.count) console.log(`  cleared ${model}: ${res.count}`);
  }
  // Keep the admin's sessions; drop everyone else's.
  const sess = await prisma.session.deleteMany(admin ? { where: { userId: { not: admin.id } } } : {});
  if (sess.count) console.log(`  cleared session: ${sess.count}`);
  // Keep only the admin user.
  const usr = await prisma.user.deleteMany({ where: { email: { not: ADMIN_EMAIL } } });
  if (usr.count) console.log(`  cleared user: ${usr.count}`);

  const after = await counts();
  console.log("\nAfter:", JSON.stringify(after));
  console.log("\n✅ Wipe complete. Admin login preserved:", (await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { email: true, role: true } })) ?? "(will auto-create on login)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
