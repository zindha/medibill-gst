# MediBill — Backup & Restore

## Overview

MediBill implements a **3-tier backup strategy**:
1. **Automatic daily local backups** — Always on, stored on local disk
2. **Automatic weekly cloud backups** — Optional, for disaster recovery
3. **Manual backups** — On-demand backup via Settings UI

---

## Data Locations

```
C:\ProgramData\MediBill\
├── data\
│   ├── medibill.db          # Main SQLite database
│   └── safety\               # Safety backups (pre-restore snapshots)
├── backups\
│   ├── daily\               # Daily automatic backups (30-day retention)
│   └── weekly\              # Weekly automatic backups (12-week retention)
└── logs\
    └── medibill.log         # Application logs
```

---

## Daily Local Backup

**When**: Every day at 02:00 AM local time (configurable)

**Process**:
1. Create a consistent snapshot using SQLite's `VACUUM INTO` (not a live file copy)
2. Store in `C:\ProgramData\MediBill\backups\daily\YYYY-MM-DD_HH-MM-SS\`
3. Run `PRAGMA integrity_check` to verify
4. Record in `backup_history` table
5. Delete backups older than 30 days

**Why VACUUM INTO**: Standard file copy while the database is active can produce a corrupted/inconsistent snapshot. `VACUUM INTO` creates a consistent copy without requiring the database to be locked.

---

## Weekly Cloud Backup

**When**: Every Sunday at 03:00 AM local time (configurable)

**Process**:
1. Create a consistent daily backup first
2. Verify integrity with `PRAGMA integrity_check`
3. Compress with gzip (typical reduction: 70-80%)
4. Encrypt with AES-256-GCM using a user-configured passphrase
5. Upload to configured cloud storage (SFTP, WebDAV, or cloud storage API)
6. Verify upload checksum
7. Record in `backup_history` with `type: "weekly"` and `file_size`
8. Delete cloud backups older than 12 weeks

**Key Management**:
- The encryption key is derived from the user's passphrase using PBKDF2 (100,000 iterations, SHA-256)
- The salt is stored alongside the backup file header
- The original passphrase is NEVER stored
- If the passphrase is lost, the backup cannot be recovered

**Cloud Provider Abstraction**:
```ts
interface CloudBackupProvider {
  upload(path: string, data: Buffer): Promise<string>; // returns remote URL
  download(url: string): Promise<Buffer>;
  list(): Promise<{ url: string; createdAt: Date; size: number }[]>;
  delete(url: string): Promise<void>;
}
```
Providers can be: SFTP, AWS S3, Google Cloud Storage, Azure Blob, custom WebDAV.

**Failure Handling**:
- If cloud upload fails, billing continues normally
- A warning is shown in the Settings UI
- The failure is logged with error details
- Retry happens automatically next week
- Manual "Backup Now" always available

---

## Manual Backup

Available from: **Settings → Backup & Restore → Backup Now**

- Creates a backup immediately
- No automatic cleanup (manual backups are kept until manually deleted)
- Can be restored from the same UI

---

## Restore Process

**CRITICAL: Restoring a backup replaces the entire current database.**

Steps:
1. User selects a backup from the history list
2. System runs `PRAGMA integrity_check` on the backup file
3. If integrity check fails: restore is BLOCKED with error message
4. If integrity check passes:
   a. Create a safety snapshot: `C:\ProgramData\MediBill\data\safety\pre_restore_YYYY-MM-DD_HH-MM-SS.db`
   b. Show confirmation dialog: "This will replace all current data with the backup from [DATE]. A safety backup has been created."
   c. On user confirmation: close all DB connections, copy backup file over `medibill.db`
   d. Return success message: "Restore completed. Please restart MediBill."
5. On next startup, Drizzle runs any pending migrations

---

## Backup Verification

Automatic verification (on backup creation):
```sql
PRAGMA integrity_check;
-- Returns "ok" if the database is consistent
```

Manual verification available in Settings UI: "Verify Backup" button

---

## Backup Health Monitoring

The Dashboard shows backup health:
- Last daily backup time and status
- Last weekly (cloud) backup time and status
- Number of recent failures (last 7 days)
- Health status: "Healthy" or "Unhealthy" (>2 failures in 7 days = unhealthy)

---

## Backup Encryption Details

**Algorithm**: AES-256-GCM
**Key Derivation**: PBKDF2-SHA256, 100,000 iterations
**Salt**: 32 bytes, randomly generated per backup
**Authentication Tag**: 16 bytes (GCM authentication)

**File Format**:
```
[4 bytes: magic "MBBK"]
[4 bytes: version = 1]
[32 bytes: salt]
[16 bytes: GCM nonce]
[N bytes: encrypted + auth tag]
```

**Decryption**:
```ts
const key = PBKDF2(passphrase, salt, 100000, 32, "SHA-256");
const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
```

---

## Disaster Recovery Checklist

If the database is corrupted or lost:

1. **Local backup available**: Use Settings → Backup & Restore → Restore
2. **Cloud backup available**: Download from cloud storage, then restore
3. **No backup available**: Data is unrecoverable — this is why backups matter

**Never work without verified backups.**
