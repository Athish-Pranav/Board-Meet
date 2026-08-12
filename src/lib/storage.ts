import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "./env";
import { prisma } from "./db";

// Pluggable file storage.
//  - "db"    : bytes stored in the FileObject table (VARBINARY(MAX)); key = "db:<id>".
//  - "local" : files under STORAGE_LOCAL_DIR (dev / on-prem).
//  - "s3"    : implement the S3/MinIO branch.
// Board papers are sensitive — whichever driver you use, encrypt at rest.

export type StoredFile = { storageKey: string; sizeBytes: number };

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

function localPath(storageKey: string): string {
  const base = path.resolve(env.storageLocalDir);
  const full = path.resolve(base, storageKey);
  if (!full.startsWith(base)) throw new Error("Invalid storage key");
  return full;
}

export async function saveFile(data: Buffer, originalName: string, mimeType?: string): Promise<StoredFile> {
  if (env.storageDriver === "db") {
    const blob = await prisma.fileObject.create({
      data: { data, sizeBytes: data.length, fileName: safeName(originalName), mimeType: mimeType ?? null },
    });
    return { storageKey: `db:${blob.id}`, sizeBytes: data.length };
  }
  if (env.storageDriver === "s3") {
    throw new Error("S3 storage driver not configured — set STORAGE_DRIVER=db or local, or implement S3 in lib/storage.ts");
  }
  // local
  const now = new Date();
  const key = path.posix.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomBytes(8).toString("hex")}-${safeName(originalName)}`,
  );
  const full = localPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return { storageKey: key, sizeBytes: data.length };
}

export async function readFile(storageKey: string): Promise<Buffer> {
  // db: keys are always readable from the database regardless of the active driver.
  if (storageKey.startsWith("db:")) {
    const id = Number(storageKey.slice(3));
    const blob = await prisma.fileObject.findUnique({ where: { id } });
    if (!blob) throw new Error("File not found in database");
    return Buffer.from(blob.data);
  }
  if (env.storageDriver === "s3") {
    throw new Error("S3 storage driver not configured");
  }
  return fs.readFile(localPath(storageKey));
}

export async function fileExists(storageKey: string): Promise<boolean> {
  if (storageKey.startsWith("db:")) {
    const id = Number(storageKey.slice(3));
    return (await prisma.fileObject.count({ where: { id } })) > 0;
  }
  try {
    await fs.access(localPath(storageKey));
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(storageKey: string): Promise<void> {
  if (storageKey.startsWith("db:")) {
    const id = Number(storageKey.slice(3));
    await prisma.fileObject.delete({ where: { id } }).catch(() => {});
    return;
  }
  try {
    await fs.unlink(localPath(storageKey));
  } catch {}
}
