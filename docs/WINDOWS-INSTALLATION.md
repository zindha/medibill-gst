# MediBill — Windows Installation Guide

## System Requirements

- **OS**: Windows 10/11 (64-bit)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk**: 500 MB for application, additional space for data and backups
- **Browser**: Chrome, Edge, or Firefox (latest version)
- **Internet**: Required only for installation package download and optional cloud backup

---

## Installation Options

### Option 1: Windows Installer (Recommended)
Download `MediBill-Setup.exe` and run it.

### Option 2: Portable (Advanced)
Extract `MediBill-Portable.zip` to any folder and run `MediBill.exe`.

---

## Installer Walkthrough

### Step 1: Welcome
```
┌─────────────────────────────────────────┐
│           Welcome to MediBill            │
│                                         │
│   Pharmacy Billing & Inventory System    │
│                                         │
│              [ Next > ]                  │
└─────────────────────────────────────────┘
```

### Step 2: License Agreement
Accept the license agreement to continue.

### Step 3: Choose Install Location
```
Default: C:\Program Files\MediBill\
```
Click "Browse" to choose a different location.

**Note**: Application binaries go in Program Files. Data goes in `C:\ProgramData\MediBill\`.

### Step 4: Data Directory
```
Default: C:\ProgramData\MediBill\
```
This is where your database, backups, and logs will be stored.
**Do not store data inside Program Files** — it requires admin access and can cause issues with Windows Updates.

### Step 5: Create Desktop Shortcut
```
[✓] Create Desktop Shortcut
[✓] Create Start Menu Entry
```

### Step 6: Review
Review installation summary, then click "Install".

### Step 7: Installing
```
Installing MediBill...
████████████████████████░░░░░░░ 75%
```

### Step 8: Complete
```
┌─────────────────────────────────────────┐
│        MediBill Installed!              │
│                                         │
│   [ ] Launch MediBill Now              │
│                                         │
│              [ Done ]                   │
└─────────────────────────────────────────┘
```

---

## First Launch

On first launch:
1. MediBill service starts automatically
2. Default browser opens to `http://localhost:3000`
3. **Admin Registration** screen appears
4. Create your admin account:
   - Name: Your name
   - Email: Your email
   - Password: Choose a strong password
5. Click "Create Account"
6. You're taken to the Dashboard

---

## Post-Installation Checklist

- [ ] Create admin account
- [ ] Configure store information (Settings → Store)
- [ ] Set up GST tax rates (Settings → Tax Config)
- [ ] Add your first supplier
- [ ] Add your first customer
- [ ] Configure invoice numbering format (Settings → Invoice Format)
- [ ] Set up daily backup schedule (Settings → Backup)
- [ ] (Optional) Configure cloud backup

---

## Uninstalling

### Via Windows Settings
1. Open **Settings → Apps → Installed Apps**
2. Find **MediBill**
3. Click **Uninstall**

### Via Control Panel
1. Open **Control Panel → Programs and Features**
2. Find **MediBill** in the list
3. Click **Uninstall**

**Data Preservation**: During uninstall, you will be asked:
```
Do you want to keep your data?
  [Keep Data] — Data remains in C:\ProgramData\MediBill
  [Remove Data] — Deletes all data, backups, and logs
```

---

## Upgrading

### Automatic Updates (Future)
When auto-update is enabled:
1. On startup, check `https://updates.medibill.in/version.json`
2. If newer version available, show notification
3. Download update in background
4. Apply after closing (or next startup)

### Manual Upgrade
1. Download new `MediBill-Setup.exe`
2. Run installer
3. Existing data is preserved automatically
4. Database migrations run automatically on first launch

---

## Service Configuration

MediBill runs as a background service. It starts automatically with Windows.

### Service Name: `MediBill`

**Start**: `net start MediBill` or Windows Services manager
**Stop**: `net stop MediBill` or Windows Services manager
**Restart**: `net stop MediBill && net start MediBill`

### Registry Location
```
HKLM\SOFTWARE\MediBill\
  InstallPath    (REG_SZ)   C:\Program Files\MediBill\
  DataPath       (REG_SZ)   C:\ProgramData\MediBill\
  Port           (REG_DWORD) 3000
  AutoStart      (REG_DWORD) 1
```

---

## Troubleshooting

### "MediBill service failed to start"
1. Check port 3000 is not in use: `netstat -ano | findstr 3000`
2. Check logs: `C:\ProgramData\MediBill\logs\`
3. Run as administrator once

### "Database is locked"
Another process is using the database. Close all MediBill windows and try again.

### "Cannot connect to server"
1. Make sure MediBill service is running (check Windows Services)
2. Try: `http://localhost:3000/api/health` in browser
3. If blank page, restart service

### "Backup failed"
- Check disk space: `C:\ProgramData\MediBill\backups\`
- Check logs for specific error
- Ensure `C:\ProgramData\MediBill\` is not on a network drive

### "Restore failed"
- Ensure MediBill is closed before restoring
- Check the safety backup was created in `C:\ProgramData\MediBill\data\safety\`

---

## Silent Installation

For enterprise deployment:
```
MediBill-Setup.exe /SILENT /SUPPRESSMSGBOXES /NORESTART
```

Custom paths:
```
MediBill-Setup.exe /SILENT /DIR="D:\MediBill"
```

---

## Environment Variables

For advanced configuration:
```
MEDIBILL_PORT=3000
MEDIBILL_HOST=127.0.0.1
MEDIBILL_DATA=C:\ProgramData\MediBill\data
```
