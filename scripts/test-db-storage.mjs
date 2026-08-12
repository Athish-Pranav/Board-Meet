// Verifies binary round-trips through the FileObject table (VARBINARY(MAX)) on
// the configured database, then cleans up. Leaves no data behind.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
process.env.DATABASE_URL = env.match(/^DATABASE_URL\s*=\s*"(.*)"\s*$/m)?.[1];

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const original = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from("round-trip ".repeat(500))]); // 0x25504446 = "%PDF"

const blob = await prisma.fileObject.create({ data: { data: original, sizeBytes: original.length, fileName: "test.bin", mimeType: "application/octet-stream" } });
const read = await prisma.fileObject.findUnique({ where: { id: blob.id } });
const back = Buffer.from(read.data);
const ok = back.equals(original);
console.log(`Stored ${original.length} bytes as FileObject#${blob.id} (key db:${blob.id})`);
console.log(`Read back ${back.length} bytes — bytes identical: ${ok ? "✅ YES" : "❌ NO"}`);

await prisma.fileObject.delete({ where: { id: blob.id } });
console.log(`Cleaned up FileObject#${blob.id}. Remaining FileObjects: ${await prisma.fileObject.count()}`);
await prisma.$disconnect();
if (!ok) process.exit(1);
