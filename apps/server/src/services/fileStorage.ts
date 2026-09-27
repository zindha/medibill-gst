import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { and, eq } from "drizzle-orm";
import { db, DATA_DIR } from "../db/index.js";
import { generateId, storedFiles } from "../db/schema/index.js";

export interface PutFileInput {
  ownerId: string;
  purpose: string;
  filename: string;
  contentType?: string;
  bytes: Buffer;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

function filesRoot(): string {
  return join(DATA_DIR, "files");
}

export const fileStorage = {
  async put(input: PutFileInput) {
    if (!Buffer.isBuffer(input.bytes)) throw new Error("bytes must be a Buffer");
    if (input.bytes.length === 0) throw new Error("empty file");
    if (input.bytes.length > MAX_BYTES) throw new Error("file too large");
    if (!input.filename || input.filename.includes("..")) throw new Error("invalid filename");
    const id = generateId();
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const dir = join(filesRoot(), input.ownerId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = join(dir, `${id}-${safeName}`);
    writeFileSync(path, input.bytes);
    await db.insert(storedFiles).values({
      id,
      ownerId: input.ownerId,
      purpose: input.purpose,
      filename: input.filename,
      contentType: input.contentType ?? null,
      size: input.bytes.length,
      sha256,
      path,
    });
    return { id, sha256, size: input.bytes.length, path };
  },

  async get(ownerId: string, id: string) {
    const rows = await db
      .select()
      .from(storedFiles)
      .where(and(eq(storedFiles.id, id), eq(storedFiles.ownerId, ownerId)))
      .limit(1);
    const row = rows[0];
    if (!row || !existsSync(row.path)) throw new Error("file not found");
    return { row, bytes: readFileSync(row.path) as Buffer };
  },
};
