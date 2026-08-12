// Derives a SQLite Prisma schema from the SQL Server schema for LOCAL FRONTEND
// TESTING ONLY. SQL Server stays the source of truth (prisma/schema.prisma).
// It strips SQL-Server-only native type attributes (@db.NVarChar(...)) and
// switches the provider to sqlite. Re-run whenever schema.prisma changes.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");

const out =
  "// AUTO-GENERATED from schema.prisma for local SQLite testing — do not edit by hand.\n" +
  "// Regenerate: node scripts/make-sqlite-schema.mjs\n\n" +
  src
    .replace(/\s*@db\.[A-Za-z]+(\([^)]*\))?/g, "") // drop @db.NVarChar(...) etc.
    .replace(/provider\s*=\s*"sqlserver"/, 'provider = "sqlite"');

writeFileSync(resolve(root, "prisma/schema.sqlite.prisma"), out);
console.log("Wrote prisma/schema.sqlite.prisma (provider = sqlite)");
