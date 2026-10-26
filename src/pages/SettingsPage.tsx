import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { usePrintPrefs, type PrintPaper, type PrintLayout } from "@/hooks/usePrintPrefs";
import { Building2, Clock3, Cloud, CloudOff, Copy, Database, Download, FileBadge, ImagePlus, KeyRound, Loader2, MapPin, MessageSquare, Printer, RefreshCw, Save, ShieldAlert, ShoppingBag, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BusinessTab = "BASIC" | "LICENSE" | "TAXATION" | "LOCATION" | "TIMINGS" | "SAFETY";

const OVERRIDE_ROLES = ["admin", "pharmacist", "cashier"] as const;

export default function SettingsPage() {
  const { isLoading: authLoading, user } = useAuth();
  const [businessTab, setBusinessTab] = useState<BusinessTab>("BASIC");
  // TIMINGS + extra business-profile fields (reuse settingsApi keys)
  const [storeAyushmanHfrId, setStoreAyushmanHfrId] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeTimings, setStoreTimings] = useState("{ \"open\": \"09:00\", \"close\": \"21:00\" }");
  const [storeFrontPicture, setStoreFrontPicture] = useState<string | null>(null);
  const storeFrontInputRef = useRef<HTMLInputElement | null>(null);

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeGstin, setStoreGstin] = useState("");
  const [storeLicense, setStoreLicense] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Expiry Safety Policy (Task 5) — settings key `expiry_policy`
  const [blockExpiredSale, setBlockExpiredSale] = useState(true);
  const [blockExpiredPurchase, setBlockExpiredPurchase] = useState(true);
  const [warningDays, setWarningDays] = useState(90);
  const [blockWithinDays, setBlockWithinDays] = useState(0);
  const [overrideRoles, setOverrideRoles] = useState<string[]>(["admin", "pharmacist"]);
  const [savingSafety, setSavingSafety] = useState(false);

  // Invoice format
  const [invoicePrefix, setInvoicePrefix] = useState("MB");
  const [savingFormat, setSavingFormat] = useState(false);

  // ─── Task 14: online ordering (settings key online_orders, default on) ──
  const [onlineOrdersEnabled, setOnlineOrdersEnabledState] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);

  // Messaging & automation (Task 9) — settings keys refill_automation / app_base_url
  const [refillMode, setRefillMode] = useState<"off" | "queue">("off");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [savingMessaging, setSavingMessaging] = useState(false);

  // Account — change the password of the signed-in user
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Backup schedule
  const [dailyHour, setDailyHour] = useState(2);
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [weeklyHour, setWeeklyHour] = useState(3);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Cloud backup — Google Drive is primary; S3/R2 stay as advanced options
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [provider, setProvider] = useState<"gdrive" | "s3" | "r2">("gdrive");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [folder, setFolder] = useState("medibill");
  const [encryptionKey, setEncryptionKey] = useState("");
  const [cloudSaving, setCloudSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; size: number; createdAt: string }>>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Print customization — paper, layout, logo, visible sections
  const { prefs: printPrefs, save: savePrintPrefs } = usePrintPrefs();
  const [printSaving, setPrintSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { settingsApi, expiryPolicyApi } = await import("@/lib/api");
      const [storeSettings, format, safety] = await Promise.all([
        settingsApi.getAll(),
        settingsApi.getInvoiceFormat(),
        expiryPolicyApi.get().catch(() => null),
      ]);
      setStoreName(storeSettings.store_name ?? "");
      setStorePhone(storeSettings.store_phone ?? "");
      setStoreEmail(storeSettings.store_email ?? "");
      setStoreAddress(storeSettings.store_address ?? "");
      setStoreGstin(storeSettings.store_gstin ?? "");
      setStoreLicense(storeSettings.store_drug_license ?? "");
      setStoreAyushmanHfrId(storeSettings.store_ayushman_hfr_id ?? storeSettings.store_hfr_id ?? "");
      setStoreLocation(storeSettings.store_location ?? storeSettings.store_address ?? "");
      try {
        const raw = storeSettings.store_timings;
        if (raw) setStoreTimings(typeof raw === "string" ? raw : JSON.stringify(raw, null, 2));
      } catch {
        // Non-JSON timings value — keep whatever is already in the field.
      }
      const pic = storeSettings.store_front_picture ?? storeSettings.store_front_image ?? null;
      if (pic) setStoreFrontPicture(typeof pic === "string" ? pic : null);
      if (format?.prefix) setInvoicePrefix(format.prefix);
      const online = storeSettings.online_orders;
      setOnlineOrdersEnabledState(online?.enabled !== false);
      const automation = storeSettings.refill_automation;
      setRefillMode(automation?.mode === "queue" ? "queue" : "off");
      setAppBaseUrl(typeof storeSettings.app_base_url === "string" ? storeSettings.app_base_url : "");
      const policy = safety?.policy;
      if (policy) {
        setBlockExpiredSale(!!policy.blockExpiredSale);
        setBlockExpiredPurchase(!!policy.blockExpiredPurchase);
        setWarningDays(Number(policy.warningDays ?? 90));
        setBlockWithinDays(Number(policy.blockWithinDays ?? 0));
        setOverrideRoles(Array.isArray(policy.allowOverrideRoles) ? policy.allowOverrideRoles : ["admin", "pharmacist"]);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const { backupApi } = await import("@/lib/api");
      const sched = await backupApi.getSchedule();
      if (sched?.config) {
        setDailyHour(sched.config.dailyHour);
        setWeeklyDay(sched.config.weeklyDay);
        setWeeklyHour(sched.config.weeklyHour);
      }
    } catch (err) {
      console.error("Failed to load schedule:", err);
    }
  }, []);

  const loadCloudStatus = useCallback(async () => {
    try {
      const { backupApi } = await import("@/lib/api");
      const status = await backupApi.getCloudStatus();
      setCloudConfigured(status.configured);
      if (status.configured) {
        setProvider(status.provider ?? "gdrive");
        setBucket(status.bucket ?? "");
        setRegion(status.region ?? "");
        setFolder(status.folder ?? "medibill");
        setDriveEmail(status.email ?? null);
      } else {
        setDriveEmail(null);
      }
    } catch (err) {
      console.error("Failed to load cloud status:", err);
    }
  }, []);

  const loadDriveFiles = useCallback(async () => {
    setDriveFilesLoading(true);
    try {
      const { backupApi } = await import("@/lib/api");
      setDriveFiles(await backupApi.driveFiles());
    } catch {
      setDriveFiles([]);
    } finally {
      setDriveFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadSchedule();
    void loadCloudStatus();
  }, [loadSettings, loadSchedule, loadCloudStatus]);

  useEffect(() => {
    if (cloudConfigured && provider === "gdrive") void loadDriveFiles();
  }, [cloudConfigured, provider, loadDriveFiles]);

  const handleSaveStore = async () => {
    setSaving(true);
    try {
      const { settingsApi } = await import("@/lib/api");
      let timingsVal: any = storeTimings;
      try { timingsVal = JSON.parse(storeTimings); } catch { /* keep as string */ }
      await Promise.all([
        settingsApi.set("store_name", storeName),
        settingsApi.set("store_phone", storePhone || null),
        settingsApi.set("store_email", storeEmail || null),
        settingsApi.set("store_address", storeAddress || null),
        settingsApi.set("store_gstin", storeGstin || null),
        settingsApi.set("store_drug_license", storeLicense || null),
        settingsApi.set("store_ayushman_hfr_id", storeAyushmanHfrId || null),
        settingsApi.set("store_location", storeLocation || null),
        settingsApi.set("store_timings", timingsVal),
        ...(storeFrontPicture ? [settingsApi.set("store_front_picture", storeFrontPicture)] : []),
      ]);
      toast.success("Store details saved");
    } catch {
      toast.error("Failed to save store details");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSafety = async () => {
    setSavingSafety(true);
    try {
      const { expiryPolicyApi } = await import("@/lib/api");
      await expiryPolicyApi.put({
        blockExpiredSale,
        blockExpiredPurchase,
        warningDays: Math.max(0, Math.min(3650, Math.round(warningDays) || 0)),
        blockWithinDays: Math.max(0, Math.min(3650, Math.round(blockWithinDays) || 0)),
        allowOverrideRoles: overrideRoles,
      });
      toast.success("Expiry safety policy saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save expiry safety policy");
    } finally {
      setSavingSafety(false);
    }
  };

  const handleStoreFrontFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose an image file (PNG/JPG)"); return; }
    if (file.size > 800 * 1024) { toast.error("Image must be under 800 KB"); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) { toast.error("Could not read the image file"); return; }
    setStoreFrontPicture(dataUrl);
    toast.success("Store front picture ready — Save to persist");
  };

  const handleSaveInvoiceFormat = async () => {
    setSavingFormat(true);
    try {
      const { settingsApi } = await import("@/lib/api");
      await settingsApi.setInvoiceFormat({ prefix: invoicePrefix, pattern: `${invoicePrefix}-YYYY-NNNNNN` });
      toast.success("Invoice format saved");
    } catch {
      toast.error("Failed to save invoice format");
    } finally {
      setSavingFormat(false);
    }
  };

  // ─── Task 14: online ordering toggle + public link copy ─────────────────
  const publicOrderLink = user?.id ? `${window.location.origin}/order?storeId=${user.id}` : "";

  const handleToggleOnlineOrders = async (enabled: boolean) => {
    const previous = onlineOrdersEnabled;
    setOnlineOrdersEnabledState(enabled);
    setSavingOnline(true);
    try {
      const { settingsApi } = await import("@/lib/api");
      await settingsApi.set("online_orders", { enabled });
      toast.success(enabled ? "Online ordering enabled" : "Online ordering disabled");
    } catch {
      setOnlineOrdersEnabledState(previous);
      toast.error("Failed to save online ordering setting");
    } finally {
      setSavingOnline(false);
    }
  };

  const handleCopyOrderLink = async () => {
    if (!publicOrderLink) {
      toast.error("Sign in to copy your public order link");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicOrderLink);
      toast.success("Public order link copied");
    } catch {
      toast.error("Could not copy — select the link and copy manually");
    }
  };

  const handleSaveMessaging = async () => {
    setSavingMessaging(true);
    try {
      const { settingsApi } = await import("@/lib/api");
      await Promise.all([
        settingsApi.set("refill_automation", { mode: refillMode }),
        settingsApi.set("app_base_url", appBaseUrl.trim()),
      ]);
      toast.success(
        refillMode === "queue"
          ? "Refill automation ON — due reminders queue every 2 minutes"
          : "Refill automation saved (manual sending only)"
      );
    } catch {
      toast.error("Failed to save messaging settings");
    } finally {
      setSavingMessaging(false);
    }
  };

  const handleSavePrint = async () => {
    setPrintSaving(true);
    try {
      await savePrintPrefs(printPrefs);
      toast.success("Print settings saved");
    } catch {
      toast.error("Failed to save print settings");
    } finally {
      setPrintSaving(false);
    }
  };

  const setPrint = (patch: Partial<typeof printPrefs>) => {
    void savePrintPrefs({ ...printPrefs, ...patch });
  };

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG/JPG)");
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error("Logo must be under 500 KB");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) {
      toast.error("Could not read the logo file");
      return;
    }
    void savePrintPrefs({ ...printPrefs, logoDataUrl: dataUrl, showLogo: true });
    toast.success("Logo added to invoices");
  };

  const handleBackup = async () => {
    try {
      const { backupApi } = await import("@/lib/api");
      await backupApi.create("manual");
      toast.success("Backup created successfully");
    } catch (err: any) {
      toast.error(err.message ?? "Backup failed");
    }
  };

  const handleSaveSchedule = async () => {
    setScheduleLoading(true);
    try {
      const { backupApi } = await import("@/lib/api");
      const result = await backupApi.updateSchedule({ dailyHour, weeklyDay, weeklyHour });
      toast.success(result?.data?.message ?? "Schedule saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save schedule");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleSaveCloudConfig = async () => {
    setCloudSaving(true);
    try {
      const { backupApi } = await import("@/lib/api");
      if (provider === "gdrive") {
        if (!folder.trim()) {
          toast.error("Drive folder name is required");
          return;
        }
        if (encryptionKey && encryptionKey.length !== 64) {
          toast.error("Encryption key must be a 64-character hex string (32 bytes)");
          return;
        }
        await backupApi.setCloudStatus({ provider, folder: folder.trim(), encryptionKey });
      } else {
        await backupApi.setCloudStatus({ provider, bucket, region, accessKeyId, secretAccessKey, folder, encryptionKey });
      }
      setCloudConfigured(true);
      toast.success("Cloud backup configuration saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save cloud configuration");
    } finally {
      setCloudSaving(false);
    }
  };

  const handleDriveConnect = async () => {
    setDriveConnecting(true);
    try {
      const { backupApi } = await import("@/lib/api");
      const { url } = await backupApi.driveAuthUrl();
      // OAuth consent must open at the server origin so the localhost
      // redirect_uri matches the registered Google client.
      const popup = window.open(url, "medibill-drive-connect", "width=520,height=640");
      if (!popup) {
        toast.error("Popup blocked — allow popups, then try Connect again");
        return;
      }
      toast("Approve Google Drive access, then return here", {
        description: "The app listens for the approval automatically.",
      });
      // The oauth-callback page posts the code back via postMessage.
      const onMessage = async (event: MessageEvent) => {
        if (event.data?.type !== "medibill-drive-code" || !event.data?.code) return;
        window.removeEventListener("message", onMessage);
        try {
          const { email } = await backupApi.driveCallback(event.data.code);
          setDriveEmail(email);
          setCloudConfigured(true);
          toast.success(`Google Drive connected${email ? ` as ${email}` : ""}`);
          void loadDriveFiles();
        } catch (err: any) {
          toast.error(err.message ?? "Drive approval failed");
        } finally {
          setDriveConnecting(false);
        }
      };
      window.addEventListener("message", onMessage);
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
          setDriveConnecting(false);
        }
      }, 1000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not start Drive approval");
      setDriveConnecting(false);
    }
  };

  const handleDriveDisconnect = async () => {
    try {
      const { backupApi } = await import("@/lib/api");
      await backupApi.driveDisconnect();
      setDriveEmail(null);
      setDriveFiles([]);
      setCloudConfigured(false);
      toast.success("Google Drive disconnected");
    } catch (err: any) {
      toast.error(err.message ?? "Disconnect failed");
    }
  };

  const handleDriveRestore = async (fileId: string, name: string) => {
    if (!confirm(`Restore "${name}"? This replaces ALL current data (a safety snapshot is kept).`)) return;
    setRestoringId(fileId);
    try {
      const { backupApi } = await import("@/lib/api");
      await backupApi.driveRestore(fileId);
      toast.success("Restore completed — please restart MediBill");
    } catch (err: any) {
      toast.error(err.message ?? "Restore failed");
    } finally {
      setRestoringId(null);
    }
  };

  const handleUploadLatest = async () => {
    setUploading(true);
    try {
      const { backupApi } = await import("@/lib/api");
      const result = await backupApi.uploadLatest();
      toast.success("Backup uploaded to cloud", { description: result.data?.url });
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed — check your cloud credentials");
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const { authApi } = await import("@/lib/api");
      await authApi.changePassword(currentPassword, newPassword);
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 space-y-6 max-w-3xl overflow-y-auto pr-1 pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Control Centre</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Select an option below to edit</p>
      </div>

      {/* Business Profile — Control Centre parity: BASIC/LICENSE/TAXATION/LOCATION/TIMINGS */}
      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Business Profile
          </CardTitle>
          <CardDescription>View or Update the details below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-3">
            {(["BASIC", "LICENSE", "TAXATION", "LOCATION", "TIMINGS", "SAFETY"] as const).map((t) => {
              const icons: Record<string, typeof Building2> = { BASIC: Building2, LICENSE: FileBadge, TAXATION: FileBadge, LOCATION: MapPin, TIMINGS: Clock3, SAFETY: ShieldAlert };
              const Icon = icons[t];
              return (
                <button
                  key={t}
                  onClick={() => setBusinessTab(t)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${businessTab === t ? "border-primary/40 bg-primary text-primary-foreground" : "border-border/60 bg-card text-muted-foreground hover:bg-secondary/40"}`}
                >
                  <Icon className="h-3.5 w-3.5" />{t}
                </button>
              );
            })}
          </div>

          {businessTab === "BASIC" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">BUSINESS NAME *</Label>
                  <Input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Lakshmi Balaji Medicals" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">AYUSHMAN HFR ID</Label>
                  <Input value={storeAyushmanHfrId} onChange={e => setStoreAyushmanHfrId(e.target.value)} placeholder="HFR-…" />
                  <p className="text-[10px] text-muted-foreground">Stored as store_ayushman_hfr_id — shown on bills when present.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={storePhone} onChange={e => setStorePhone(e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={storeEmail} onChange={e => setStoreEmail(e.target.value)} placeholder="store@example.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">STORE FRONT PICTURE</Label>
                <div className="flex items-center gap-3">
                  {storeFrontPicture ? (
                    <img src={storeFrontPicture} alt="Store front preview" className="h-20 max-w-40 rounded-sm border border-border/60 bg-white object-contain p-1" />
                  ) : (
                    <div className="flex h-20 w-32 items-center justify-center rounded-sm border border-dashed border-border text-[10px] text-muted-foreground text-center px-2">No image — upload a storefront photo</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <input ref={storeFrontInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleStoreFrontFile(e.target.files?.[0]); e.target.value = ""; }} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => storeFrontInputRef.current?.click()}>
                        <ImagePlus className="h-3.5 w-3.5 mr-1.5" />{storeFrontPicture ? "Change" : "Upload"} image
                      </Button>
                      {storeFrontPicture && (
                        <Button variant="ghost" size="sm" onClick={() => setStoreFrontPicture(null)}>
                          <X className="h-3.5 w-3.5 mr-1" />Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">PNG/JPG under 800 KB — appears on bills header when set.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {businessTab === "LICENSE" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Drug License No.</Label>
                <Input value={storeLicense} onChange={e => setStoreLicense(e.target.value)} placeholder="DL-MUM-123456" />
                <p className="text-[10px] text-muted-foreground">Printed on every GST invoice — keep it up to date.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ayushman HFR ID (also here)</Label>
                <Input value={storeAyushmanHfrId} onChange={e => setStoreAyushmanHfrId(e.target.value)} placeholder="HFR-…" />
              </div>
            </div>
          )}

          {businessTab === "TAXATION" && (
            <div className="space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-xs">GSTIN</Label>
                <Input value={storeGstin} onChange={e => setStoreGstin(e.target.value)} placeholder="27AABCU1234D1Z5" className="uppercase" />
                <p className="text-[10px] text-muted-foreground">15-char GSTIN — validated on invoice save. Required for e-invoice (e-Invoice &amp; Compliance page).</p>
              </div>
              <p className="text-xs text-muted-foreground">Tax rates are set per-medicine (GST slab 0/5/12/18/28) — see Inventory. This tab keeps the header GSTIN that anchors GSTR-1/3B.</p>
            </div>
          )}

          {businessTab === "LOCATION" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Store Address</Label>
                <Input value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Shop No. 1, Main Road, City - 400001" />
                <p className="text-[10px] text-muted-foreground">Also saved as store_location — shown on bills & delivery.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location / Area</Label>
                <Input value={storeLocation} onChange={e => setStoreLocation(e.target.value)} placeholder="Near Bus Stand, Chromepet" />
              </div>
            </div>
          )}

          {businessTab === "TIMINGS" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Store Timings (JSON)</Label>
                <Textarea value={storeTimings} onChange={e => setStoreTimings(e.target.value)} rows={4} className="font-mono text-xs" placeholder='{"open": "09:00", "close": "21:00", "days": "Mon-Sat"}' />
                <p className="text-[10px] text-muted-foreground">Stored as store_timings (JSON). Example: {"{"}"open": "09:00", "close": "21:00"{"}"} — leave valid JSON.</p>
              </div>
            </div>
          )}

          {businessTab === "SAFETY" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-2.5 rounded-md border border-border/60 p-3">
                  <Checkbox checked={blockExpiredSale} onCheckedChange={(v) => setBlockExpiredSale(v === true)} className="mt-0.5" />
                  <div className="space-y-0.5">
                    <Label className="text-xs">Block expired stock sales</Label>
                    <p className="text-[10px] text-muted-foreground">A batch past its expiry date can never be billed (severity: blocked).</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-md border border-border/60 p-3">
                  <Checkbox checked={blockExpiredPurchase} onCheckedChange={(v) => setBlockExpiredPurchase(v === true)} className="mt-0.5" />
                  <div className="space-y-0.5">
                    <Label className="text-xs">Block expired stock purchases</Label>
                    <p className="text-[10px] text-muted-foreground">Incoming/expired batch expiry dates are refused on purchase bills.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Warning window (days)</Label>
                  <Input type="number" min={0} max={3650} value={warningDays} onChange={e => setWarningDays(Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Expiring within N days shows a non-blocking warning on sale/purchase.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Block window (days)</Label>
                  <Input type="number" min={0} max={3650} value={blockWithinDays} onChange={e => setBlockWithinDays(Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Expiring within N days is blocked (0 = disabled). Overrides allowed.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Roles that may override a blocked batch</Label>
                <div className="flex flex-wrap gap-4">
                  {OVERRIDE_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-xs capitalize">
                      <Checkbox
                        checked={overrideRoles.includes(role)}
                        onCheckedChange={(v) =>
                          setOverrideRoles((prev) => (v === true ? [...prev, role] : prev.filter((r) => r !== role)))
                        }
                      />
                      {role}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Overrides apply to "blocked" rows only and require a reason (audited). Warnings never block.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button onClick={() => (businessTab === "SAFETY" ? void handleSaveSafety() : void handleSaveStore())} disabled={businessTab === "SAFETY" ? savingSafety : saving}>
              {(businessTab === "SAFETY" ? savingSafety : saving) ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
              {businessTab === "SAFETY" ? "Save Safety Policy" : "Save Business Profile"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {businessTab === "SAFETY"
              ? "Safety saves the expiry policy (settings key expiry_policy) — one policy for this install."
              : "All tabs save together — only the visible tab’s fields are highlighted, but Save persists BASIC/LICENSE/TAXATION/LOCATION/TIMINGS."}
          </p>
        </CardContent>
      </Card>

      {/* Invoice Format */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-base font-mono">📄</span>
            Invoice Format
          </CardTitle>
          <CardDescription>Invoice numbers are auto-generated. Change the prefix to match your existing numbering scheme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice Prefix</Label>
              <Input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="MB" className="uppercase font-mono" />
              <p className="text-[10px] text-muted-foreground">Format: {invoicePrefix}-YYYY-NNNNNN (e.g. {invoicePrefix}-2026-000001)</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void handleSaveInvoiceFormat()} disabled={savingFormat}>
              {savingFormat ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              Save Format
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Online Ordering (Task 14) */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            Online Ordering
          </CardTitle>
          <CardDescription>
            Customers order through your public link — orders land in Dashboard → Orders as
            “pending”. When disabled, the public form refuses new orders (403) but the queue stays
            visible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Accept online orders</Label>
              <p className="text-[10px] text-muted-foreground">
                Settings key <span className="font-mono">online_orders</span> — enabled by default
                on a new install.
              </p>
            </div>
            <Switch
              checked={onlineOrdersEnabled}
              onCheckedChange={(v) => void handleToggleOnlineOrders(v)}
              disabled={savingOnline}
              aria-label="Enable online ordering"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Public order link</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={publicOrderLink || "Sign in to generate your link"}
                className="h-8 flex-1 min-w-52 text-xs font-mono"
                onFocus={(e) => e.target.select()}
                aria-label="Public order link"
              />
              <Button variant="outline" size="sm" className="h-8" onClick={() => void handleCopyOrderLink()}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Share it on WhatsApp/status boards — opens the branded order form at{" "}
              <span className="font-mono">/order?storeId=…</span> (no login needed).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Print Customization */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-muted-foreground" />
            Print Customization
          </CardTitle>
          <CardDescription>Laser A4 or thermal receipt, compact or detailed layout, logo, and which sections print. Applies to New Bill and Invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Paper + layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Printer paper</Label>
              <Select value={printPrefs.paper} onValueChange={(v: PrintPaper) => setPrint({ paper: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laser-a4">Laser / Inkjet — A4 full invoice</SelectItem>
                  <SelectItem value="thermal-80">Thermal — 80mm receipt</SelectItem>
                  <SelectItem value="thermal-58">Thermal — 58mm receipt</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {printPrefs.paper === "laser-a4"
                  ? "Full GST invoice with HSN tax table — for A4/letter printers."
                  : "Narrow receipt: item/qty/amount only, no tax table — for thermal printers."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Layout</Label>
              <Select value={printPrefs.layout} onValueChange={(v: PrintLayout) => setPrint({ layout: v })} disabled={printPrefs.paper !== "laser-a4"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detailed">Detailed — all columns</SelectItem>
                  <SelectItem value="compact">Compact — item / qty / amount</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {printPrefs.paper !== "laser-a4" ? "Thermal always prints compact." : "Compact hides MRP, rate, and GST columns."}
              </p>
            </div>
          </div>

          <Separator />

          {/* Logo */}
          <div>
            <p className="text-sm font-medium mb-2">Shop logo</p>
            <div className="flex items-center gap-3">
              {printPrefs.logoDataUrl ? (
                <img src={printPrefs.logoDataUrl} alt="Shop logo preview" className="h-12 max-w-32 rounded-sm border border-border/60 bg-white object-contain p-1" />
              ) : (
                <div className="flex h-12 w-24 items-center justify-center rounded-sm border border-dashed border-border text-[10px] text-muted-foreground">
                  No logo
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleLogoFile(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5 mr-1.5" />{printPrefs.logoDataUrl ? "Change" : "Upload"} logo
                  </Button>
                  {printPrefs.logoDataUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setPrint({ logoDataUrl: null })}>
                      <X className="h-3.5 w-3.5 mr-1" />Remove
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">PNG/JPG under 500 KB — prints above your shop name.</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Sections */}
          <div>
            <p className="text-sm font-medium mb-2">Sections on the bill</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                ["showLogo", "Shop logo"],
                ["showHsn", "HSN column"],
                ["showMrp", "MRP column"],
                ["showTaxTable", "GST tax table"],
                ["showSavings", "You-save row"],
                ["showNotes", "Notes"],
                ["showTerms", "Terms text"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-sm border border-border/50 px-2 py-1.5 text-xs hover:bg-secondary/40">
                  <Checkbox checked={printPrefs[key]} onCheckedChange={(v) => setPrint({ [key]: v === true } as Partial<typeof printPrefs>)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Terms / footer text</Label>
            <Textarea value={printPrefs.footerText} onChange={(e) => setPrint({ footerText: e.target.value })} rows={2} className="text-xs" placeholder="Terms printed at the bottom of every bill" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Print copies</Label>
              <Select value={String(printPrefs.copies)} onValueChange={(v) => setPrint({ copies: Number(v) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "copy" : "copies"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void handleSavePrint()} disabled={printSaving}>
              {printSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
              Save Print Settings
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Toggles save instantly; the button confirms everything is stored on the server too.</p>
        </CardContent>
      </Card>

      {/* Backup & Schedule */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />
            Data Backup
          </CardTitle>
          <CardDescription>Create local backups and configure automatic backup schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Manual backup */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Manual Backup</p>
              <p className="text-xs text-muted-foreground mt-0.5">Take a point-in-time snapshot of your database now.</p>
            </div>
            <Button variant="outline" onClick={() => void handleBackup()}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Create Backup
            </Button>
          </div>

          <Separator />

          {/* Schedule */}
          <div>
            <p className="text-sm font-medium mb-3">Auto-Backup Schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Daily Backup Hour (IST)</Label>
                <Select value={String(dailyHour)} onValueChange={v => setDailyHour(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i.toString().padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Weekly Backup Day</Label>
                <Select value={String(weeklyDay)} onValueChange={v => setWeeklyDay(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                      <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Weekly Backup Hour (IST)</Label>
                <Select value={String(weeklyHour)} onValueChange={v => setWeeklyHour(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i.toString().padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="outline" size="sm" onClick={() => void handleSaveSchedule()} disabled={scheduleLoading}>
                {scheduleLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                Save Schedule
              </Button>
            </div>
          </div>

          <Separator />

          {/* Cloud upload */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              {cloudConfigured ? (
                <Cloud className="h-4 w-4 text-green-500" />
              ) : (
                <CloudOff className="h-4 w-4 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">Cloud Backup</p>
              {cloudConfigured && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Configured</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Google Drive is the primary backup target — one click to connect, weekly uploads are automatic. Amazon S3 or Cloudflare R2 remain for advanced setups. AES-256-GCM encryption is applied before upload — your data is never stored unencrypted in the cloud.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Provider</Label>
                <Select value={provider} onValueChange={(v: "gdrive" | "s3" | "r2") => setProvider(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gdrive">Google Drive (recommended)</SelectItem>
                    <SelectItem value="r2">Cloudflare R2</SelectItem>
                    <SelectItem value="s3">Amazon S3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{provider === "gdrive" ? "Drive Folder Name" : "Bucket Name"}</Label>
                <Input value={provider === "gdrive" ? folder : bucket} onChange={e => provider === "gdrive" ? setFolder(e.target.value) : setBucket(e.target.value)} placeholder={provider === "gdrive" ? "medibill" : "my-medibill-backups"} />
              </div>
              {provider !== "gdrive" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Region / Zone</Label>
                    <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="auto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Folder Prefix</Label>
                    <Input value={folder} onChange={e => setFolder(e.target.value)} placeholder="medibill" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Access Key ID</Label>
                    <Input value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} placeholder="AKIA..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secret Access Key</Label>
                    <Input type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} placeholder="••••••••" />
                  </div>
                </>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Encryption Key (64-char hex = 32 bytes)</Label>
                <Input
                  type="password"
                  value={encryptionKey}
                  onChange={e => setEncryptionKey(e.target.value)}
                  placeholder="Generate with: node -e &quot;console.log(require('crypto').randomBytes(32).toString('hex'))&quot;"
                />
                <p className="text-[10px] text-muted-foreground">
                  Generate: <code className="bg-muted px-1 rounded">node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</code>
                </p>
              </div>
            </div>
            {/* Google Drive connection */}
            {provider === "gdrive" && (
              <div className="mt-3 rounded-sm border border-border/60 bg-secondary/30 p-3">
                {driveEmail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">Connected as <span className="font-medium">{driveEmail}</span></span>
                    <Button variant="outline" size="sm" onClick={() => void loadDriveFiles()} disabled={driveFilesLoading}>
                      {driveFilesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      Refresh files
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleDriveDisconnect()}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">Save the folder + encryption key first, then connect your Google account.</p>
                    <Button size="sm" onClick={() => void handleDriveConnect()} disabled={driveConnecting}>
                      {driveConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Cloud className="h-3.5 w-3.5 mr-1" />}
                      Connect Google Drive
                    </Button>
                  </div>
                )}
                {driveEmail && (
                  <div className="mt-2">
                    {driveFilesLoading ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading Drive backups…</p>
                    ) : driveFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No Drive backups yet — weekly uploads appear here automatically.</p>
                    ) : (
                      <ul className="space-y-1">
                        {driveFiles.slice(0, 12).map((f) => (
                          <li key={f.id} className="flex items-center justify-between gap-2 rounded-sm border border-border/40 bg-background px-2 py-1.5 text-xs">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{f.name}</span>
                              <span className="text-muted-foreground">{new Date(f.createdAt).toLocaleString("en-IN")} · {(f.size / 1024).toFixed(0)} KB</span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                              <Button variant="outline" size="sm" className="h-7" disabled={restoringId !== null} onClick={() => void handleDriveRestore(f.id, f.name)}>
                                {restoringId === f.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                                Restore
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => void handleSaveCloudConfig()} disabled={cloudSaving}>
                {cloudSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                Save Configuration
              </Button>
              {cloudConfigured && (
                <Button variant="outline" size="sm" onClick={() => void handleUploadLatest()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Upload className="h-3.5 w-3.5 mr-2" />}
                  Upload Latest Backup
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messaging & Automation (Task 9) */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Messaging &amp; Automation
          </CardTitle>
          <CardDescription>
            Refill reminder automation and the base URL used in shared invoice links. Provider
            credentials (WHATSAPP_API_TOKEN, SMS_WEBHOOK_URL, EMAIL_WEBHOOK_URL) live only in the
            server .env — never in this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Refill automation</Label>
              <Select value={refillMode} onValueChange={(v) => setRefillMode(v as "off" | "queue")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off — send manually</SelectItem>
                  <SelectItem value="queue">Queue — cron sends due reminders</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                In <span className="font-medium">Queue</span> mode the server scans due reminders every
                2 minutes and queues them (opt-outs and missing phones are skipped).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">App base URL</Label>
              <Input
                value={appBaseUrl}
                onChange={(e) => setAppBaseUrl(e.target.value)}
                placeholder="https://billing.example.com"
                className="h-9 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Used for invoice share links (<span className="font-mono">/dashboard/invoices/…</span>).
                Defaults to http://localhost:5173 when empty.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void handleSaveMessaging()} disabled={savingMessaging}>
              {savingMessaging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
              Save Messaging Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account — change own password */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update the password of the account you are signed in with. Minimum 6 characters — an
            administrator can also reset it for you from Staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Current password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm new password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void handleChangePassword()} disabled={savingPassword}>
              {savingPassword ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <KeyRound className="h-3.5 w-3.5 mr-2" />
              )}
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
