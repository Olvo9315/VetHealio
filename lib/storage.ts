import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// File storage with swappable drivers, chosen by STORAGE_DRIVER:
// - "db" (default): file bytes in Postgres (StoredFile table). Works on Vercel, no extra service.
// - "fs": files on local disk under STORAGE_DIR. For a VPS with a persistent volume.
// Files are served through /api/files/<key>; keys under "public/" are readable without login.

interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  remove(key: string): Promise<void>;
}

const dbDriver: StorageDriver = {
  async put(key, data, contentType) {
    const bytes = new Uint8Array(data);
    await prisma.storedFile.upsert({
      where: { key },
      create: { key, data: bytes, contentType, size: bytes.length },
      update: { data: bytes, contentType, size: bytes.length },
    });
  },
  async get(key) {
    const file = await prisma.storedFile.findUnique({ where: { key } });
    return file ? { data: Buffer.from(file.data), contentType: file.contentType } : null;
  },
  async remove(key) {
    await prisma.storedFile.deleteMany({ where: { key } });
  },
};

function fsPath(key: string) {
  const root = path.resolve(process.env.STORAGE_DIR ?? "./storage");
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

const fsDriver: StorageDriver = {
  async put(key, data) {
    const full = fsPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },
  async get(key) {
    try {
      const data = await fs.readFile(fsPath(key));
      return { data, contentType: guessContentType(key) };
    } catch {
      return null;
    }
  },
  async remove(key) {
    await fs.rm(fsPath(key), { force: true });
  },
};

function driver(): StorageDriver {
  return process.env.STORAGE_DRIVER === "fs" ? fsDriver : dbDriver;
}

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export function isValidKey(key: string) {
  return /^[a-zA-Z0-9/_.-]+$/.test(key) && !key.includes("..");
}

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

export async function putFile(key: string, data: Buffer, contentType = guessContentType(key)) {
  if (!isValidKey(key)) throw new Error("Invalid storage key");
  await driver().put(key, data, contentType);
  return key;
}

export async function getFile(key: string) {
  if (!isValidKey(key)) return null;
  return driver().get(key);
}

export async function deleteFile(key: string) {
  if (!isValidKey(key)) return;
  await driver().remove(key);
}

export async function uploadStaffDocument(
  file: Buffer,
  fileName: string,
  staffId: string,
  folder: "diploma" | "contract" | "certification" = "diploma"
): Promise<string> {
  return putFile(`staff/${staffId}/${folder}/${safeFileName(fileName)}`, file);
}

export function safeFileName(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 60);
  return `${Date.now()}-${base || "file"}${ext ? `.${ext}` : ""}`;
}

export function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
