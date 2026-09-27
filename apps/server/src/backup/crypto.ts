/**
 * Shared AES-256-GCM file encryption for cloud backups.
 *
 * Layout (identical for S3/R2 and Google Drive):
 *   [IV (16 bytes)] [AuthTag (16 bytes)] [Ciphertext (...)]
 *
 * The key is a 32-byte hex string (64 chars) stored in settings as
 * `cloud_backup_encryption_key`.
 */

import crypto from "crypto";

function toKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be a 64-character hex string (32 bytes)");
  }
  return key;
}

export function encryptFile(buffer: Buffer, hexKey: string): Buffer {
  const key = toKey(hexKey);
  const iv = crypto.randomBytes(16); // AES-GCM IV = 16 bytes

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Layout: [IV (16)] [AuthTag (16)] [Ciphertext (...)]
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptFile(encrypted: Buffer, hexKey: string): Buffer {
  const key = toKey(hexKey);

  if (encrypted.length < 32) {
    throw new Error("Encrypted backup is truncated or invalid");
  }

  const iv = encrypted.subarray(0, 16);
  const authTag = encrypted.subarray(16, 32);
  const ciphertext = encrypted.subarray(32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
