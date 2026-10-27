import { mkdir, writeFile, copyFile, rm } from "fs/promises";
import path from "path";

const ROOT = process.env.VARIANT_STORAGE_DIR || path.join(process.cwd(), "storage");
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertId(id: string) {
  if (!ID.test(id)) throw new Error("Invalid id");
}

export function sourcePath(userId: string, sourceId: string) {
  assertId(userId);
  assertId(sourceId);
  return path.join(ROOT, "sources", userId, `${sourceId}.bin`);
}

export function variantPath(userId: string, variantId: string) {
  assertId(userId);
  assertId(variantId);
  return path.join(ROOT, "variants", userId, `${variantId}.mp4`);
}

export function projectPath(userId: string, projectId: string) {
  assertId(userId);
  assertId(projectId);
  return path.join(ROOT, "projects", userId, `${projectId}.mp4`);
}

export function assetPath(userId: string, projectId: string, assetId: string, ext: string) {
  assertId(userId);
  assertId(projectId);
  assertId(assetId);
  if (!/^[a-z0-9]{1,4}$/.test(ext)) throw new Error("Invalid file");
  return path.join(ROOT, "projects", userId, `${projectId}-assets`, `${assetId}.${ext}`);
}

export function storageRoot() {
  return ROOT;
}

export async function saveBytes(filePath: string, data: Buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function copyBytes(from: string, to: string) {
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
}

export async function removeFile(filePath: string) {
  await rm(filePath, { force: true });
}
