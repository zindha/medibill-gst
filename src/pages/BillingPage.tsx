import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  GSTInvoiceTemplate,
  PrintContainer,
} from "@/components/GSTInvoiceTemplate";
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import { ExpiryMMYYInput } from "@/components/ExpiryMMYYInput";
import { MoneyInput } from "@/components/MoneyInput";
import { FitText } from "@/components/FitText";
import { RowMedicineInput } from "@/components/RowMedicineInput";
import { MedicineAlternatives } from "@/components/MedicineAlternatives";
import {
  type CatalogMedicine,
} from "@/hooks/useMedicineCatalog";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useHotkeys } from "@/hooks/useHotkeys";
import { focusNextField } from "@/hooks/useEnterToNextField";
import { usePrintPrefs } from "@/hooks/usePrintPrefs";
import { formatExpiryMY, formatPackQty } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  PackagePlus,
  Plus,
  Printer,
  Repeat,
  Save,
  Search,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { invoicesApi } from "@/lib/api";
import { toast } from "sonner";

type SellUnit = "pack" | "loose";

interface LineItem {
  medicineId?: string;
  batchId?: string;
  batchNo?: string;
  expiryDate?: string;
  availableBatches?: BatchOption[];
  medicineName: string;
  hsnCode?: string;
  quantity: number;      // qty entered in the current sell unit (packs, or tablets when loose)
  unit: string;
  unitsPerPack: number;  // tablets/capsules per pack (e.g. 15 for a 15-tab strip)
  sellUnit: SellUnit;    // sell by whole pack/strip or by loose unit (tablet)
  mrp: number;          // MRP per pack (inclusive of GST — cannot exceed)
  purchasePrice: number; // cost price per pack (to detect loss)
  sellingPrice: number;  // mrp - discount, per pack (what customer pays per pack)
  discount: number;      // discount per pack
  schedule?: string;     // H/H1/X flag for the RX badge
  packSizeLabel?: string; // pack-size hint (e.g. "15's") rendered beside qty
  amount: number;         // packQty × sellingPrice
  gstRate: 0 | 5 | 12 | 18 | 28;
  gstAmount: number;      // GST on one pack
  cgst: number;
  sgst: number;
  isBelowFloor: boolean; // true if sellingPrice < purchasePrice(per pack) + GST
  showRateOverride?: boolean; // explicit override reveal for MRP/GST%/Rate
  isNewRow?: boolean;    // suppress entrance animation after first paint
  error?: string;        // inline row-level validation message
}

/** Convert a line item's entered quantity into whole-pack (strip) units. */
function packQtyOf(item: Pick<LineItem, "quantity" | "unitsPerPack" | "sellUnit">): number {
  if (item.sellUnit === "loose") {
    const upp = Math.max(1, item.unitsPerPack || 1);
    return item.quantity / upp;
  }
  return item.quantity;
}

/** Per-unit selling price in the item's chosen sell unit (per pack, or per tablet). */
function unitRateOf(item: Pick<LineItem, "sellingPrice" | "unitsPerPack" | "sellUnit">): number {
  if (item.sellUnit === "loose") {
    const upp = Math.max(1, item.unitsPerPack || 1);
    return item.sellingPrice / upp;
  }
  return item.sellingPrice;
}

/** Recompute money/stock fields for a line item given its raw inputs. */
function recomputeItem(item: LineItem): LineItem {
  const packQty = packQtyOf(item);
  const amount = packQty * item.sellingPrice;
  // GST is derived per pack (sellingPrice is per pack), then scaled by packQty
  // through totals. amount, gstAmount stay per-pack for the tax table.
  const { gstAmount, cgst, sgst } = calcGSTFromSellingPrice(item.sellingPrice, item.gstRate);
  return {
    ...item,
    amount,
    gstAmount,
    cgst,
    sgst,
    isBelowFloor: isBelowFloor(item.purchasePrice, item.sellingPrice, item.gstRate),
  };
}

const GST_RATES = [0, 5, 12, 18, 28] as const;

/** FEFO-ordered batch option shown in the picker and line rows. */
interface BatchOption {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  isExpired?: boolean;
}

const BILLING_DRAFT_KEY = "medibill:billing-draft:v1";

interface DraftLine {
  medicineId?: string;
  batchId?: string;
  batchNo?: string;
  expiryDate?: string;
  medicineName: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  unitsPerPack: number;
  sellUnit: SellUnit;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  discount: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
}

interface BillingDraft {
  items: DraftLine[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerId?: string;
  doctorId?: string;
  discount: number;
  paymentMode: string;
  notes: string;
  saleDate?: string;
  batchOrder?: "fefo" | "fifo";
}

function loadDraft(): BillingDraft | null {
  try {
    const raw = localStorage.getItem(BILLING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillingDraft;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Expiry display is MM/YY everywhere — thin alias over the shared formatter. */
function formatExpiry(raw?: string): string {
  return formatExpiryMY(raw);
}

function daysToExpiry(raw?: string): number | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

/** Parse a pack-size hint like "15's", "15 tabs", "10*2xl" into a number of units. */
function parsePackSize(raw?: string | number | null): number | undefined {
  if (typeof raw === "number" && raw > 0) return raw;
  if (!raw) return undefined;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) || undefined : undefined;
}

/**
 * MRP is inclusive of GST.
 * SellingPrice = MRP - discount (this IS the taxable amount, GST already in it).
 * BaseAmount = SellingPrice / (1 + gstRate/100)  — ex-GST base for CGST/SGST reporting.
 */
function calcGSTFromSellingPrice(sellingPrice: number, rate: number) {
  const baseAmount = sellingPrice / (1 + rate / 100);
  const gstAmount = sellingPrice - baseAmount;
  return {
    baseAmount,    // ex-GST base
    gstAmount,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2,
  };
}

/** Check if selling price is below floor (purchase price + GST). */
function isBelowFloor(purchasePrice: number, sellingPrice: number, gstRate: number): boolean {
  const floorPrice = purchasePrice * (1 + gstRate / 100);
  return sellingPrice < floorPrice;
}

/**
 * Task 6 — does this medicine schedule require a prescription? Mirrors the
 * server rule (scheduleRequiresPrescription): H, H1 and X are enforced.
 */
function scheduleNeedsRx(schedule?: string | null): boolean {
  if (!schedule) return false;
  return /^(H1?|X)$/i.test(schedule.trim());
}

export default function BillingPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Local state for REST API data
  const [medicines, setMedicines] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // True once the catalog/customer lists have been fetched (or failed) — the
  // order-prefill effect below waits for it so medicine rows resolve.
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // ─── Task 14: bill an online order (/dashboard/billing?orderId=…) ────────
  const [searchParams, setSearchParams] = useSearchParams();
  const billingOrderId = searchParams.get("orderId") ?? "";
  const [billingOrder, setBillingOrder] = useState<any>(null);
  // Next invoice number computed by the fetch effect below — declared BEFORE
  // that effect so the closure never reads a binding declared later.
  const [getNextInvoiceNo, setGetNextInvoiceNo] = useState<string>("");

  // Fetch data on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchData = async () => {
      try {
        const { medicinesApi, customersApi, doctorsApi, invoicesApi } = await import("@/lib/api");
        const [meds, custs, docs] = await Promise.all([
          medicinesApi.list(),
          customersApi.list(),
          doctorsApi.list(),
        ]);
        setMedicines(meds);
        setCustomers(custs);
        setDoctors(docs);
        // Next invoice number — ask the server (same generator POST / uses) so
        // the header preview matches the install-wide sequence. The old
        // client-side guess derived from this tenant's list could disagree
        // (fallback MB-...-000001) and show a number the server never assigns.
        try {
          const next = await invoicesApi.nextNumber();
          if (next?.invoiceNo) setGetNextInvoiceNo(next.invoiceNo);
        } catch {
          setGetNextInvoiceNo(`MB-${new Date().getFullYear()}-000001`);
        }
      } catch (err) {
        console.error("Failed to load billing data:", err);
        setGetNextInvoiceNo(`MB-${new Date().getFullYear()}-000001`);
      } finally {
        setCatalogLoaded(true);
      }
    };
    fetchData();
  }, [isAuthenticated]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const [items, setItems] = useState<LineItem[]>([
    {
      medicineName: "",
      quantity: 0,
      unit: "Strip",
      unitsPerPack: 1,
      sellUnit: "pack",
      mrp: 0,
      purchasePrice: 0,
      sellingPrice: 0,
      discount: 0,
      amount: 0,
      gstRate: 0,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
      isBelowFloor: false,
      isNewRow: false,
    },
  ]);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [doctorId, setDoctorId] = useState<string | undefined>(undefined);
  const [discount, setDiscount] = useState(0);
  // ─── Task 10: offer + loyalty — both fold into the bill discount ─────────
  const [activeOffers, setActiveOffers] = useState<any[]>([]);
  const [offerId, setOfferId] = useState<string>("none");
  const [offerEval, setOfferEval] = useState<{ applies: boolean; discount: number; reason: string | null } | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [rupeePerPoint, setRupeePerPoint] = useState(1);

  // Active offers + loyalty conversion rate (both non-blocking: billing must
  // work even when the engagement endpoints are unavailable).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { engagementApi, settingsApi } = await import("@/lib/api");
        const [offers, loyaltyRow] = await Promise.all([
          engagementApi.listOffers({ activeOnly: true }).catch(() => []),
          settingsApi.get("loyalty").catch(() => null),
        ]);
        if (cancelled) return;
        setActiveOffers(Array.isArray(offers) ? offers : []);
        const value = loyaltyRow?.value;
        if (value && typeof value.rupeePerPoint === "number" && value.rupeePerPoint >= 0) {
          setRupeePerPoint(value.rupeePerPoint);
        }
      } catch {
        /* leave defaults — offers stay optional */
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Loyalty balance follows the selected customer.
  useEffect(() => {
    if (!customerId) {
      setLoyaltyBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { engagementApi } = await import("@/lib/api");
        const view = await engagementApi.loyalty(customerId);
        if (!cancelled) setLoyaltyBalance(view.balance);
      } catch {
        if (!cancelled) setLoyaltyBalance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [batchOrder, setBatchOrder] = useState<"fefo" | "fifo">("fefo");
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  // ─── Task 6: prescription link for scheduled drugs (H/H1/X) ─────────────
  const [prescriptionId, setPrescriptionId] = useState<string | undefined>(undefined);
  const [prescription, setPrescription] = useState<any>(null);
  const [showRxPicker, setShowRxPicker] = useState(false);
  const [rxSearch, setRxSearch] = useState("");
  const [rxResults, setRxResults] = useState<any[]>([]);
  const [rxSearching, setRxSearching] = useState(false);
  const [rxNewOpen, setRxNewOpen] = useState(false);
  const [rxNewName, setRxNewName] = useState("");
  const [rxNewImage, setRxNewImage] = useState<File | null>(null);
  const [rxNewSaving, setRxNewSaving] = useState(false);
  const [showRxRequired, setShowRxRequired] = useState(false);
  const [rxRequiredItems, setRxRequiredItems] = useState<string[]>([]);
  const [barcode, setBarcode] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const { prefs: printPrefs, shop: printShop } = usePrintPrefs();
  const [lastInvoice, setLastInvoice] = useState<{
    invoiceNo: string;
    date: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    paymentMode?: string;
    subtotal: number;
    totalGst: number;
    cgst: number;
    sgst: number;
    igst: number;
    discount?: number;
    grandTotal: number;
    notes?: string;
    items: Array<{
      medicineName: string;
      hsnCode?: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
      gstRate: number;
      gstAmount: number;
      cgst: number;
      sgst: number;
    }>;
  } | null>(null);

  const pickerIndexRef = useRef<number | null>(null);

  // ─── Counter-speed state ─────────────────────────────────────
  const [draftRestored, setDraftRestored] = useState(false);
  const [formError, setFormError] = useState("");
  // Expiry Safety Policy: batches the server refused (400 + blocked[]).
  const [blockedExpiry, setBlockedExpiry] = useState<any[] | null>(null);
  const fetchedBatchesRef = useRef<Record<string, BatchOption[]>>({});

  const blankLine = useCallback(
    (overrides?: Partial<LineItem>): LineItem => ({
      medicineName: "",
      quantity: 0,
      unit: "Strip",
      unitsPerPack: 1,
      sellUnit: "pack",
      mrp: 0,
      purchasePrice: 0,
      sellingPrice: 0,
      discount: 0,
      amount: 0,
      gstRate: 0,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
      isBelowFloor: false,
      isNewRow: true,
      ...overrides,
    }),
    [],
  );

  const setRowError = useCallback((index: number, error?: string) => {
    setItems((prev) => {
      if (!prev[index] || prev[index].error === (error ?? undefined)) return prev;
      const next = [...prev];
      next[index] = { ...next[index], error: error ?? undefined };
      return next;
    });
  }, []);

  const filteredCustomers = customers?.filter(
    (c: any) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch)),
  );

  // ─── AJAX search: query the server as the user types ───────────────
  const [serverCusts, setServerCusts] = useState<any[]>([]);
  const [serverDoctors, setServerDoctors] = useState<any[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const debouncedCustSearch = useDebouncedValue(customerSearch.trim(), 300);
  const debouncedDoctorSearch = useDebouncedValue(doctorSearch.trim(), 300);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!debouncedCustSearch) { setServerCusts([]); setCustSearching(false); return; }
    let active = true;
    setCustSearching(true);
    (async () => {
      try {
        const { customersApi } = await import("@/lib/api");
        const res = await customersApi.list({ search: debouncedCustSearch, limit: 50 });
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (active) setServerCusts(list);
      } catch { if (active) setServerCusts([]); }
      finally { if (active) setCustSearching(false); }
    })();
    return () => { active = false; };
  }, [debouncedCustSearch, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!debouncedDoctorSearch) { setServerDoctors([]); setDoctorSearching(false); return; }
    let active = true;
    setDoctorSearching(true);
    (async () => {
      try {
        const { doctorsApi } = await import("@/lib/api");
        const res = await doctorsApi.list({ search: debouncedDoctorSearch, limit: 50 });
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (active) setServerDoctors(list);
      } catch { if (active) setServerDoctors([]); }
      finally { if (active) setDoctorSearching(false); }
    })();
    return () => { active = false; };
  }, [debouncedDoctorSearch, isAuthenticated]);

  // ─── Prescription picker: open (pending/verified) prescriptions ─────────
  const debouncedRxSearch = useDebouncedValue(rxSearch.trim(), 300);
  useEffect(() => {
    if (!isAuthenticated || !showRxPicker) return;
    let active = true;
    setRxSearching(true);
    (async () => {
      try {
        const { prescriptionsApi } = await import("@/lib/api");
        const res = await prescriptionsApi.list({ q: debouncedRxSearch || undefined, limit: 20 });
        const open = (res.data ?? []).filter((p: any) => p.status === "pending" || p.status === "verified");
        if (active) setRxResults(open);
      } catch { if (active) setRxResults([]); }
      finally { if (active) setRxSearching(false); }
    })();
    return () => { active = false; };
  }, [debouncedRxSearch, showRxPicker, isAuthenticated]);

  const selectPrescription = (p: any) => {
    setPrescription(p);
    setPrescriptionId(p.id);
    setShowRxPicker(false);
    setRxSearch("");
    setRxNewOpen(false);
    setRxNewName("");
    setRxNewImage(null);
  };

  const clearPrescription = () => {
    setPrescription(undefined);
    setPrescriptionId(undefined);
  };

  /** Mini-form inside the picker: create a prescription and select it at once. */
  const createAndSelectPrescription = async () => {
    if (!rxNewName.trim()) { toast.error("Patient name is required"); return; }
    setRxNewSaving(true);
    try {
      const { prescriptionsApi, filesApi } = await import("@/lib/api");
      let imageFileId: string | undefined;
      if (rxNewImage) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Could not read the image"));
          reader.readAsDataURL(rxNewImage);
        });
        const stored = await filesApi.upload({
          filename: rxNewImage.name || "prescription.jpg",
          contentType: rxNewImage.type || "image/jpeg",
          data: dataUrl,
        });
        imageFileId = stored.id;
      }
      const created = await prescriptionsApi.create({
        patientName: rxNewName.trim(),
        customerId: customerId || undefined,
        doctorId: doctorId || undefined,
        date: new Date().toISOString().split("T")[0],
        imageFileId,
      });
      selectPrescription(created);
      toast.success("Prescription created and attached");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create prescription");
    } finally {
      setRxNewSaving(false);
    }
  };

  // ─── Draft restore: refresh mid-bill keeps items/customer/discount ──
  useEffect(() => {
    if (!isAuthenticated || draftRestored) return;
    // Ordering a bill from an online order takes precedence over a saved draft.
    if (billingOrderId) {
      setDraftRestored(true);
      return;
    }
    const draft = loadDraft();
    if (!draft) {
      setDraftRestored(true);
      return;
    }
    setItems(draft.items.map((d) => recomputeItem({ ...blankLine(), ...d, isNewRow: false })));
    setCustomerName(draft.customerName ?? "");
    setCustomerPhone(draft.customerPhone ?? "");
    setCustomerAddress(draft.customerAddress ?? "");
    setCustomerId(draft.customerId);
    setDoctorId(draft.doctorId);
    setDiscount(typeof draft.discount === "number" ? draft.discount : 0);
    setPaymentMode(draft.paymentMode || "Cash");
    setNotes(draft.notes ?? "");
    if (typeof draft.saleDate === "string" && draft.saleDate) setSaleDate(draft.saleDate);
    if (draft.batchOrder === "fefo" || draft.batchOrder === "fifo") setBatchOrder(draft.batchOrder);
    setDraftRestored(true);
    toast("Draft bill restored", { description: "Your unsaved bill survived the refresh." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, draftRestored]);

  // ─── Draft persist (debounced by the save tick below) ─────────
  const draftTick = useDebouncedValue(
    JSON.stringify({ items, customerName, customerPhone, customerAddress, customerId, doctorId, discount, paymentMode, notes, saleDate, batchOrder }),
    500,
  );
  useEffect(() => {
    if (!draftRestored) return;
    try {
      const parsed = JSON.parse(draftTick) as BillingDraft & { items: DraftLine[] };
      const hasContent = parsed.items.some((i) => i.medicineName || (i.mrp ?? 0) > 0) ||
        parsed.customerName || parsed.customerPhone || parsed.discount > 0 || parsed.notes;
      if (hasContent) {
        localStorage.setItem(BILLING_DRAFT_KEY, draftTick);
      } else {
        localStorage.removeItem(BILLING_DRAFT_KEY);
      }
    } catch { /* storage unavailable — draft stays in memory */ }
  }, [draftTick, draftRestored]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(BILLING_DRAFT_KEY);
    } catch { /* ignore */ }
  }, []);

  const custPickerList =
    customerSearch.trim() && debouncedCustSearch === customerSearch.trim() ? serverCusts : (filteredCustomers ?? []);
  const doctorPickerList =
    doctorSearch.trim() && debouncedDoctorSearch === doctorSearch.trim() ? serverDoctors : (doctors ?? []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev.map((r) => ({ ...r, isNewRow: false })), blankLine()]);
    // Focus the new row's medicine field once painted.
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-row-medicine-input]');
      inputs[inputs.length - 1]?.focus();
    });
  }, [blankLine]);

  const lastRemovedRef = useRef<{ item: LineItem; index: number } | null>(null);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      if (prev.length === 1) {
        toast("A bill needs at least one row — clear it instead of deleting.");
        return prev;
      }
      lastRemovedRef.current = { item: prev[index], index };
      const next = prev.filter((_, i) => i !== index);
      toast("Row removed", {
        action: {
          label: "Undo",
          onClick: () => {
            const saved = lastRemovedRef.current;
            if (!saved) return;
            setItems((cur) => {
              const restored = [...cur];
              restored.splice(Math.min(saved.index, restored.length), 0, saved.item);
              return restored;
            });
            lastRemovedRef.current = null;
          },
        },
      });
      return next;
    });
  }, []);

  const updateItem = <K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) => {
    setItems((prev) => {
      if (!prev[index]) return prev;
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value } as LineItem;
      // A fresh edit clears a stale row error — revalidation happens on save.
      if (field !== "error") newItems[index].error = undefined;

      // Discount is derived, never typed: discount = MRP − sellingPrice.
      // MRP change: keep the sell-price ratio (usual counter case: MRP corrected).
      if (field === "mrp") {
        const newMrp = value as number;
        const old = prev[index];
        const ratio = old.mrp > 0 ? old.sellingPrice / old.mrp : 1;
        const newSp = Math.max(0, Math.min(newMrp, newMrp * ratio));
        newItems[index].sellingPrice = newSp;
        newItems[index].discount = Math.max(0, newMrp - newSp);
      }
      // Direct sellingPrice change — recompute derived discount, guard MRP
      if (field === "sellingPrice") {
        const newRate = value as number;
        if (newRate > newItems[index].mrp) {
          toast.error("Selling price cannot exceed MRP!");
          newItems[index].sellingPrice = newItems[index].mrp;
          newItems[index].discount = 0;
        } else {
          newItems[index].sellingPrice = newRate;
          newItems[index].discount = Math.max(0, newItems[index].mrp - newRate);
        }
      }

      newItems[index] = recomputeItem(newItems[index]);
      return newItems;
    });
  };

  /** Set quantity + unit atomically (avoids clobbering across two setItems). */
  const setRowQty = (index: number, quantity: number, sellUnit: SellUnit) => {
    setItems((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = recomputeItem({ ...next[index], quantity: Math.max(0, quantity), sellUnit, error: undefined });
      return next;
    });
  };

  const applyMedicineToRow = useCallback((idx: number, med: any, batches: BatchOption[]) => {
    // Qty stays blank (0) — the counter types it. GST comes from inventory;
    // unknown stays 0 so nothing is silently assumed.
    const qty = 0;
    // FEFO default: earliest-expiry available batch; fall back to row MRP.
    const first = batches.find((b) => !b.isExpired && b.quantity > 0) ?? batches[0];
    const mrp = first?.mrp ?? med.mrp ?? med.sellingPrice ?? 0;
    const purchasePrice = first?.purchasePrice ?? med.purchasePrice ?? 0;
    const discount = 0;
    const sellingPrice = Math.max(0, mrp - discount);
    const gstRate = (Number(med.gstRate) || 0) as LineItem["gstRate"];
    const { gstAmount, cgst, sgst } = calcGSTFromSellingPrice(sellingPrice, gstRate);
    const unitsPerPack = parsePackSize(med.unitsPerPack ?? med.packSize) ?? 1;
    const schedule = typeof med.schedule === "string" && med.schedule.trim() ? med.schedule.trim() : undefined;
    const packSizeLabel = typeof med.packSize === "string" && med.packSize.trim() ? med.packSize.trim() : undefined;
    setItems((prev) => {
      const next = [...prev];
      next[idx] = recomputeItem({
        ...next[idx],
        medicineId: med.id ?? med._id,
        batchId: first?.id ?? med.batchId,
        batchNo: first?.batchNo ?? med.batchNo,
        expiryDate: first?.expiryDate ?? med.expiryDate,
        availableBatches: batches,
        medicineName: med.name,
        hsnCode: med.hsnCode,
        schedule,
        packSizeLabel,
        quantity: qty,
        unit: med.unit || "Strip",
        unitsPerPack,
        sellUnit: "pack",
        mrp,
        purchasePrice,
        sellingPrice,
        discount,
        amount: 0,
        gstRate,
        gstAmount,
        cgst,
        sgst,
        isBelowFloor: isBelowFloor(purchasePrice, sellingPrice, gstRate),
        error: undefined,
      });
      return next;
    });
  }, []);

  // Batch order toggle: FEFO (earliest expiry) or FIFO (oldest received).
  // loadBatchesFor reads the current toggle via ref so existing callbacks
  // need no dep-array changes; cache key includes the order. The ref is
  // synced in an effect (never during render — react-hooks/refs).
  const batchOrderRef = useRef(batchOrder);
  useEffect(() => {
    batchOrderRef.current = batchOrder;
  });

  const loadBatchesFor = useCallback(async (medicineId: string, order?: "fefo" | "fifo"): Promise<BatchOption[]> => {
    const effective = order ?? batchOrderRef.current;
    const cacheKey = `${medicineId}:${effective}`;
    if (fetchedBatchesRef.current[cacheKey]) return fetchedBatchesRef.current[cacheKey];
    try {
      const { inventoryApi } = await import("@/lib/api");
      const res: any = await inventoryApi.getAvailableBatches(medicineId, effective);
      const list: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      const opts: BatchOption[] = list.map((b: any) => ({
        id: b.id,
        batchNo: b.batchNo ?? "—",
        expiryDate: b.expiryDate ?? "",
        quantity: b.quantity ?? 0,
        mrp: b.mrp ?? 0,
        purchasePrice: b.purchasePrice ?? 0,
        sellingPrice: b.sellingPrice ?? b.mrp ?? 0,
        isExpired: b.expiryDate ? new Date(b.expiryDate).getTime() < Date.now() : false,
      }));
      fetchedBatchesRef.current[cacheKey] = opts;
      return opts;
    } catch {
      return [];
    }
  }, []);

  // Flipping the batch order re-resolves untouched batch lists in the new
  // order; rows with an explicitly picked batch keep selection and price.
  useEffect(() => {
    setItems((prev) => {
      if (!prev.some((r) => r.medicineId && !r.batchId && r.availableBatches?.length)) return prev;
      return prev.map((r) =>
        r.medicineId && !r.batchId && r.availableBatches?.length
          ? { ...r, availableBatches: undefined }
          : r,
      );
    });
  }, [batchOrder]);

  // ─── Task 14: prefill the bill from an online order (?orderId=…) ────────
  // On save, the invoice runs the normal create path (stock/FEFO/expiry) and
  // then best-effort marks the source order delivered with the invoice id.
  const prefilledOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !catalogLoaded || !draftRestored || !billingOrderId) return;
    if (prefilledOrderIdRef.current === billingOrderId) return;
    prefilledOrderIdRef.current = billingOrderId;
    // No cancellation flag: React StrictMode's double-invoke would otherwise
    // cancel the first run and let the second (guarded) run skip the fetch.
    // setState after a real unmount is a harmless no-op in React 18.
    (async () => {
      try {
        const { ordersApi } = await import("@/lib/api");
        const order = await ordersApi.get(billingOrderId);
        setBillingOrder(order);
        setCustomerName(order.customerName ?? "");
        setCustomerPhone(order.phone ?? "");
        setCustomerAddress(order.deliveryAddress ?? "");
        if (order.notes) setNotes(order.notes);

        // Match an existing customer by id / phone / name — otherwise the
        // ad-hoc name+phone fields above are billed as-is.
        const match = customers.find(
          (c: any) =>
            (!!order.customerId && c.id === order.customerId) ||
            (!!c.phone && c.phone === order.phone) ||
            (c.name ?? "").trim().toLowerCase() === (order.customerName ?? "").trim().toLowerCase(),
        );
        if (match) setCustomerId(match.id);

        const rows: any[] = Array.isArray(order.items) ? order.items : [];
        if (rows.length > 0) {
          // One bill row per order line before filling them in.
          setItems((prev) => {
            const next: LineItem[] = prev.map((r) => ({ ...r, isNewRow: false }));
            while (next.length < rows.length) next.push(blankLine());
            return next;
          });
          const missing: string[] = [];
          for (let i = 0; i < rows.length; i++) {
            const item = rows[i];
            const med = medicines.find((m: any) => m.id === item.medicineId);
            if (!med) {
              missing.push(item.medicineName ?? item.medicineId);
              continue;
            }
            const rowBatches = await loadBatchesFor(String(med.id));
            applyMedicineToRow(i, { ...med, _id: med.id }, rowBatches);
            setRowQty(i, Number(item.quantity) || 1, "pack");
            // Honor the price the customer was quoted on the portal (defaults
            // to MRP − discount otherwise, which can overcharge vs unitPrice).
            const quoted = Number((item as any).unitPrice ?? (item as any).unit_price);
            if (Number.isFinite(quoted) && quoted > 0) {
              updateItem(i, "sellingPrice", quoted);
            }
          }
          if (missing.length > 0) {
            toast.error(
              `Not in this catalog: ${missing.join(", ")} — pick those medicines manually.`,
            );
          }
        }

        // Prescription image → auto-create + select a pending prescription
        // (same flow as the picker's inline create). Best-effort: a staff user
        // who is not the file owner gets a 400 and billing continues.
        if (order.prescriptionFileId && order.prescriptionFile && !prescriptionId) {
          try {
            const { prescriptionsApi } = await import("@/lib/api");
            const createdRx = await prescriptionsApi.create({
              patientName: order.customerName || "Online customer",
              date: new Date().toISOString().split("T")[0],
              imageFileId: order.prescriptionFileId,
              notes: `From online order #${order.id.slice(0, 8)}`,
            });
            selectPrescription(createdRx);
          } catch (err: any) {
            toast.error(
              err?.message
                ? `Prescription not attached — ${err.message}`
                : "Prescription not attached",
            );
          }
        }

        toast(`Billing order #${order.id.slice(0, 8)}`, {
          description: "Rows are prefilled — review, then save the invoice.",
        });
      } catch (err: any) {
        prefilledOrderIdRef.current = null;
        toast.error(err?.message ?? "Could not load the order for billing");
        setSearchParams({}, { replace: true });
        setBillingOrder(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, catalogLoaded, draftRestored, billingOrderId]);

  // ─── Inline batch+expiry: one FEFO box per row (no dialog) ──────────

  /** Load (and cache) a row's FEFO batch list; returns it for typing/picking. */
  const ensureBatches = useCallback(async (rowIndex: number): Promise<BatchOption[]> => {
    const row = items[rowIndex];
    if (!row?.medicineId) return [];
    if (row.availableBatches && row.availableBatches.length > 0) return row.availableBatches;
    const batches = await loadBatchesFor(String(row.medicineId));
    setItems((prev) => {
      const next = [...prev];
      if (next[rowIndex]) next[rowIndex] = { ...next[rowIndex], availableBatches: batches };
      return next;
    });
    return batches;
  }, [items, loadBatchesFor]);

  // ─── Counter-speed helpers ───────────────────────────────────
  const [scanCode, setScanCode] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);

  /** First empty row, or a fresh appended row. */
  const targetRowForNewItem = useCallback((): number => {
    const empty = items.findIndex((r) => !r.medicineName.trim());
    if (empty >= 0) return empty;
    const idx = items.length;
    setItems((prev) => [...prev.map((r) => ({ ...r, isNewRow: false })), blankLine()]);
    return idx;
  }, [items, blankLine]);

  const focusQty = (idx: number) => {
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-bill-row="${idx}"]`);
      const el = row?.querySelector('[data-cell="strips"]') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  };

  /** Which row's inline search is expanded (only one searches at a time). */
  const [activeRow, setActiveRow] = useState<number | null>(null);

  /** Out-of-stock prompt: add a batch to inventory, then bill the same row. */
  const [stockPrompt, setStockPrompt] = useState<{
    rowIdx: number;
    medicineId: string;
    medicineName: string;
    typedBatchNo: string;
    mrp: number;
    purchasePrice: number;
    sellingPrice: number;
  } | null>(null);
  const [stockForm, setStockForm] = useState({
    batchNo: "",
    expiryDate: "",
    strips: 0,
    loose: 0,
    mrp: 0,
    purchasePrice: 0,
    sellingPrice: 0,
  });
  const [stockSaving, setStockSaving] = useState(false);

  /** Create the batch from the popup, refresh the row, and continue billing. */
  const confirmAddStock = useCallback(async () => {
    if (!stockPrompt) return;
    const { rowIdx, medicineId } = stockPrompt;
    // Popup holds MM/YY → end-of-month ISO for storage.
    const m = stockForm.expiryDate.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    const expiry = m
      ? `20${m[2]}-${m[1]}-${String(new Date(2000 + Number(m[2]), Number(m[1]), 0).getDate()).padStart(2, "0")}`
      : "";
    if (!stockForm.batchNo.trim() || !expiry) {
      toast.error("Batch # and expiry as MM/YY are required");
      return;
    }
    const row = items[rowIdx];
    const upp = Math.max(1, row?.unitsPerPack || 1);
    const totalTabs = Math.round(stockForm.strips) * upp + Math.round(stockForm.loose);
    if (totalTabs <= 0) {
      toast.error("Enter strips, loose tabs, or both");
      return;
    }
    if (stockForm.mrp <= 0) {
      toast.error("MRP must be above zero");
      return;
    }
    setStockSaving(true);
    try {
      const { inventoryApi } = await import("@/lib/api");
      const batch = await inventoryApi.createBatch({
        medicineId,
        batchNo: stockForm.batchNo.trim().toUpperCase(),
        expiryDate: expiry,
        mrp: stockForm.mrp,
        purchasePrice: stockForm.purchasePrice,
        sellingPrice: Math.min(stockForm.sellingPrice || stockForm.mrp, stockForm.mrp),
        quantity: totalTabs,
      });
      // Invalidate cache (both orders + legacy key) so the new batch is visible immediately.
      delete fetchedBatchesRef.current[`${medicineId}:fefo`];
      delete fetchedBatchesRef.current[`${medicineId}:fifo`];
      delete fetchedBatchesRef.current[medicineId];
      const batches = await loadBatchesFor(medicineId);
      const created = { ...(batch as any), quantity: totalTabs };
      const list = [created, ...batches.filter((b) => b.id !== created.id)];
      const med = { id: medicineId, name: stockPrompt.medicineName };
      applyMedicineToRow(rowIdx, med, list);
      // Select the just-created batch explicitly (FEFO may prefer an older one).
      setItems((prev) => {
        const next = [...prev];
        const r = next[rowIdx];
        if (r) {
          const ratio = r.mrp > 0 ? r.sellingPrice / r.mrp : 1;
          const sellingPrice = Math.max(0, Math.min(created.mrp, created.mrp * ratio));
          const { gstAmount, cgst, sgst } = calcGSTFromSellingPrice(sellingPrice, r.gstRate);
          next[rowIdx] = recomputeItem({
            ...r,
            batchId: created.id,
            batchNo: created.batchNo,
            expiryDate: created.expiryDate,
            mrp: created.mrp,
            purchasePrice: created.purchasePrice,
            sellingPrice,
            gstAmount,
            cgst,
            sgst,
            isBelowFloor: isBelowFloor(created.purchasePrice, sellingPrice, r.gstRate),
            error: undefined,
          });
        }
        return next;
      });
      setStockPrompt(null);
      toast.success(`Stock added — ${formatPackQty(totalTabs, upp)} ready to bill`);
      focusQty(rowIdx);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add stock — try again");
    } finally {
      setStockSaving(false);
    }
  }, [stockPrompt, stockForm, items, loadBatchesFor, applyMedicineToRow]);
  const openStockPrompt = useCallback((rowIdx: number, med: any, typedBatchNo: string) => {
    const row = items[rowIdx];
    setStockForm({
      batchNo: typedBatchNo || row?.batchNo || "",
      expiryDate: row?.expiryDate ? formatExpiryMY(row.expiryDate) : "",
      strips: 0,
      loose: 0,
      mrp: row?.mrp || med.mrp || 0,
      purchasePrice: row?.purchasePrice || med.purchasePrice || 0,
      sellingPrice: row?.sellingPrice || med.sellingPrice || med.mrp || 0,
    });
    setStockPrompt({
      rowIdx,
      medicineId: String(med.id ?? med._id ?? row?.medicineId ?? ""),
      medicineName: med.name ?? row?.medicineName ?? "",
      typedBatchNo,
      mrp: med.mrp || 0,
      purchasePrice: med.purchasePrice || 0,
      sellingPrice: med.sellingPrice || med.mrp || 0,
    });
  }, [items]);

  /** Inline pick: stock medicine fills THIS row, then focus jumps to its Qty. */
  const pickStockForRow = useCallback(async (rowIdx: number, med: any) => {
    const medId = med.id ?? med._id;
    applyMedicineToRow(rowIdx, { ...med, _id: medId }, []);
    setActiveRow(null);
    if (medId) {
      const batches = await loadBatchesFor(String(medId));
      if (batches.length > 0) {
        applyMedicineToRow(rowIdx, { ...med, _id: medId }, batches);
      } else {
        // Medicine exists but has zero sellable stock — offer add-to-inventory.
        openStockPrompt(rowIdx, med, "");
        return;
      }
    }
    focusQty(rowIdx);
  }, [applyMedicineToRow, loadBatchesFor, openStockPrompt]);

  /** Inline pick: catalog entry is created into inventory, then fills THIS row. */
  const pickCatalogForRow = useCallback(async (rowIdx: number, entry: CatalogMedicine) => {
    try {
      const { medicinesApi } = await import("@/lib/api");
      const existing = medicines.find(
        (m) => m.name.toLowerCase() === entry.name.toLowerCase(),
      );
      if (existing) {
        await pickStockForRow(rowIdx, { ...existing, _id: existing.id });
        return;
      }
      const med = await medicinesApi.create({
        name: entry.name,
        brand: entry.company,
        category: entry.category,
        composition: entry.composition,
        unit: entry.unit,
        purchasePrice: entry.price || 0,
        sellingPrice: entry.price || 0,
        mrp: entry.price || 0,
        gstRate: String(entry.gstRate) as any,
        hsnCode: entry.hsnCode,
      });
      await pickStockForRow(rowIdx, { ...med, _id: med.id });
      toast("Added to inventory", { description: "Rate filled from the medicine database — verify before printing." });
    } catch {
      toast("Failed to add medicine");
    }
  }, [medicines, pickStockForRow]);

  const closeMedPicker = useCallback(() => {
    pickerIndexRef.current = null;
    setPickerIndex(null);
    setShowMedPicker(false);
    setBarcode("");
    setBarcodeError("");
    setShowScanner(false);
  }, []);

  /** Scan-bar: barcode straight into the bill, no dialog hopping. */
  const scanIntoBill = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanLoading(true);
    setScanError("");
    try {
      const { medicinesApi } = await import("@/lib/api");
      const med = await medicinesApi.getByBarcode(trimmed);
      if (!med) {
        setScanError(`No match for "${trimmed}" — search by name below.`);
        return;
      }
      const medId = med.id ?? med._id;
      const batches = medId ? await loadBatchesFor(String(medId)) : [];
      const idx = targetRowForNewItem();
      applyMedicineToRow(idx, { ...med, _id: medId }, batches);
      setScanCode("");
      focusQty(idx);
    } catch {
      setScanError("Scan lookup failed — try again.");
    } finally {
      setScanLoading(false);
    }
  }, [targetRowForNewItem, loadBatchesFor, applyMedicineToRow]);

  const lookupBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const idx = pickerIndexRef.current;
      setBarcodeLoading(true);
      setBarcodeError("");
      try {
        const { medicinesApi } = await import("@/lib/api");
        const med = await medicinesApi.getByBarcode(trimmed);
        if (med) {
          setBarcode("");
          setShowMedPicker(false);
          await pickStockForRow(idx ?? 0, { ...med, _id: med.id });
        } else {
          // Dead-end toasts lose the sale — offer a create-from-barcode path.
          setBarcodeError(`No medicine found with barcode "${trimmed}"`);
          if (idx !== null) {
            try {
              const created = await medicinesApi.create({
                name: `Unnamed item (${trimmed})`,
                barcode: trimmed,
                unit: "Strip",
                purchasePrice: 0,
                sellingPrice: 0,
                mrp: 0,
                gstRate: "12",
              });
              toast("New barcode — added as unnamed item", {
                description: "Name it and set the rate before saving.",
                action: { label: "Use it", onClick: () => void pickStockForRow(idx, { ...created, _id: created.id }) },
              });
            } catch { /* stay on the error message — operator can retry */ }
          }
        }
      } catch {
        setBarcodeError("Failed to look up barcode");
      } finally {
        setBarcodeLoading(false);
      }
    },
    [pickStockForRow],
  );

  const selectCustomer = (c: any) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setCustomerAddress(c.address || "");
    setShowCustomerPicker(false);
    setCustomerSearch("");
  };

  const clearCustomer = () => {
    setCustomerId(undefined);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
  };

  const selectDoctor = (d: any) => {
    setDoctorId(d.id);
    setShowDoctorPicker(false);
    setDoctorSearch("");
  };

  const clearDoctor = () => {
    setDoctorId(undefined);
    setDoctorSearch("");
  };

  const totals = items.reduce(
    (acc, item) => {
      const packQty = packQtyOf(item);
      return {
        subtotal: acc.subtotal + item.amount,             // what customer pays (packQty × price per pack)
        totalMrp: acc.totalMrp + item.mrp * packQty,      // MRP total (before discount), in pack units
        totalGst: acc.totalGst + item.gstAmount * packQty,
        cgst: acc.cgst + item.cgst * packQty,
        sgst: acc.sgst + item.sgst * packQty,
        totalSavings: acc.totalSavings + (item.mrp - item.sellingPrice) * packQty,
        belowFloorItems: item.isBelowFloor ? acc.belowFloorItems + 1 : acc.belowFloorItems,
      };
    },
    { subtotal: 0, totalMrp: 0, totalGst: 0, cgst: 0, sgst: 0, totalSavings: 0, belowFloorItems: 0 },
  );

  // Bill discount is a flat ₹ amount off the subtotal — never below zero total.
  const clampedDiscount = Math.max(0, Math.min(discount || 0, totals.subtotal));

  // Server-side offer preview: the API evaluates against the pre-GST subtotal,
  // same as invoice creation will. Re-evaluated whenever the bill changes.
  const offerBaseSubtotal = Math.max(0, totals.subtotal - totals.totalGst);
  useEffect(() => {
    if (!offerId || offerId === "none") {
      setOfferEval(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { engagementApi } = await import("@/lib/api");
        const medicineIds = [...new Set(
          items.map((i) => i.medicineId).filter((id): id is string => !!id)
        )];
        const result = await engagementApi.evaluateOffer(offerId, {
          subtotal: offerBaseSubtotal,
          medicineIds,
        });
        if (!cancelled) setOfferEval(result);
      } catch (err: any) {
        if (!cancelled) {
          setOfferEval({ applies: false, discount: 0, reason: err?.message ?? "Offer unavailable" });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [offerId, offerBaseSubtotal, items]);

  const offerDiscountPreview = offerEval?.applies ? Number(offerEval.discount) || 0 : 0;
  const loyaltyValuePreview = Math.max(0, Number(loyaltyPoints) || 0) * rupeePerPoint;
  const grandTotal = Math.max(
    0,
    totals.subtotal - clampedDiscount - offerDiscountPreview - loyaltyValuePreview
  );

  // Rows that actually have content — empty trailing placeholder is ignored for validation
  const activeRowsForValidation = items.filter((i) => i.medicineName.trim() || i.medicineId);

  const saveDisabledReason = (() => {
    if (submitting) return "Saving…";
    if (activeRowsForValidation.length === 0) return "Add at least one medicine";
    if (activeRowsForValidation.some((i) => !i.medicineId)) return "Pick each item from the search list — free-typed lines don't move stock";
    if (activeRowsForValidation.some((i) => packQtyOf(i) <= 0)) return "Qty can't be zero — enter strips or loose";
    if (activeRowsForValidation.some((i) => i.mrp <= 0)) return "Set the MRP (incl. GST) on every row";
    if (activeRowsForValidation.some((i) => i.isBelowFloor)) return "A row is below purchase price";
    return "";
  })();

  /** Per-row validation with inline error + focus. Returns row index or -1. */
  const validateRows = (): number => {
    const isEmptyRow = (r: LineItem) => !r.medicineName.trim() && !r.medicineId;
    const activeIndices = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !isEmptyRow(item));
    if (activeIndices.length === 0) {
      setRowError(0, "Pick a medicine — type the name or scan the barcode.");
      return 0;
    }
    for (const { item, idx } of activeIndices) {
      if (!item.medicineName.trim()) {
        setRowError(idx, "Pick a medicine — type the name or scan the barcode.");
        return idx;
      }
      if (!item.medicineId) {
        setRowError(idx, "Choose this item from inventory so stock actually moves — free-typed lines don't deduct.");
        return idx;
      }
      if (packQtyOf(item) <= 0) {
        setRowError(idx, "Qty can't be zero — enter strips or loose, or both.");
        return idx;
      }
      if (item.gstRate <= 0) {
        setRowError(idx, "GST auto-fills from inventory — pick it if it stayed blank.");
        return idx;
      }
      if (item.mrp <= 0) {
        setRowError(idx, "Set the MRP per pack (it already includes GST).");
        return idx;
      }
      if (item.sellingPrice < 0 || item.sellingPrice > item.mrp) {
        setRowError(idx, `Rate must sit between 0 and the MRP of ₹${item.mrp.toFixed(2)}.`);
        return idx;
      }
    }
    // Clear stale errors when everything passes.
    setItems((prev) => (prev.some((r) => r.error) ? prev.map((r) => ({ ...r, error: undefined })) : prev));
    return -1;
  };

  /** Enter-key flow: move focus box-to-box inside a row, then to the next row. */
  const focusCell = (rowIdx: number, cell: "item" | "batch" | "expiry" | "strips" | "loose" | "mrp" | "disc" | "sell") => {
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-bill-row="${rowIdx}"]`);
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (cell === "item") {
        (row.querySelector("[data-row-medicine-input]") as HTMLInputElement | null)?.focus();
        return;
      }
      (row.querySelector(`[data-cell="${cell}"]`) as HTMLInputElement | null)?.focus();
    });
  };

  const focusRow = (idx: number) => {
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-bill-row="${idx}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      (row?.querySelector("input") as HTMLInputElement | null)?.focus();
    });
  };

  const handleSubmit = async (override?: { reason?: string; prescriptionOverride?: boolean }) => {
    setFormError("");
    setBlockedExpiry(null);
    const bad = validateRows();
    if (bad >= 0) {
      focusRow(bad);
      return;
    }
    const billableItems = items.filter((i) => i.medicineName.trim() || i.medicineId);
    // Hard guard: strips=0 + loose=0 => packQty 0 is never billable, even if validateRows was bypassed
    const zeroQtyIdx = billableItems.findIndex((i) => packQtyOf(i) <= 0);
    if (zeroQtyIdx >= 0) {
      const realIdx = items.indexOf(billableItems[zeroQtyIdx]);
      setRowError(realIdx, "Qty can't be zero — enter strips or loose, or both.");
      focusRow(realIdx);
      return;
    }
    // Block if any item is below floor price (loss-making)
    if (billableItems.some((i) => i.isBelowFloor)) {
      const idx = billableItems.findIndex((i) => i.isBelowFloor);
      const realIdx = items.indexOf(billableItems[idx]);
      setRowError(realIdx, "Below purchase price — raise the Rate before saving.");
      focusRow(realIdx);
      return;
    }
    // Task 6 — scheduled drugs (H/H1/X) need a prescription before we even
    // hit the server: offer attach/create, an allowed override, or cancel.
    if (!prescriptionId && !override?.prescriptionOverride) {
      const rxNames = billableItems.filter((i) => scheduleNeedsRx(i.schedule)).map((i) => i.medicineName);
      if (rxNames.length > 0) {
        setRxRequiredItems(rxNames);
        setShowRxRequired(true);
        return;
      }
    }
    setSubmitting(true);
    try {
      const invoiceNo = getNextInvoiceNo || `MB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const date = saleDate || new Date().toISOString().split("T")[0];
      const isCredit = paymentMode === "Credit";

      // Base amount = sum of (sellingPrice(pack) / (1+gstRate/100)) * packQty for each billable item — empty placeholder excluded
      const billableSubtotal = billableItems.reduce((sum, i) => sum + i.amount, 0);
      const baseAmount = billableItems.reduce((sum, item) => {
        const base = item.sellingPrice / (1 + item.gstRate / 100);
        return sum + base * packQtyOf(item);
      }, 0);
      const billableTotals = billableItems.reduce(
        (acc, item) => {
          const packQty = packQtyOf(item);
          return {
            totalGst: acc.totalGst + item.gstAmount * packQty,
            cgst: acc.cgst + item.cgst * packQty,
            sgst: acc.sgst + item.sgst * packQty,
          };
        },
        { totalGst: 0, cgst: 0, sgst: 0 },
      );
      const billableClampedDiscount = Math.max(0, Math.min(discount || 0, billableSubtotal));
      const billableGrandTotal = Math.max(
        0,
        billableSubtotal - billableClampedDiscount - offerDiscountPreview - loyaltyValuePreview
      );

      const created = await invoicesApi.create({
        invoiceNo,
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        doctorId: doctorId || undefined,
        date,
        batchOrder,
        subtotal: baseAmount,
        totalGst: billableTotals.totalGst,
        cgst: billableTotals.cgst,
        sgst: billableTotals.sgst,
        discount: billableClampedDiscount || 0,
        grandTotal: billableGrandTotal,
        paymentMode: paymentMode.toLowerCase(),
        status: isCredit ? "unpaid" : "paid",
        amountPaid: isCredit ? 0 : billableGrandTotal,
        discountAmount: billableClampedDiscount || 0,
        notes: notes || undefined,
        prescriptionId,
        prescriptionOverride: !!override?.prescriptionOverride,
        overrideExpiry: !!override?.reason,
        overrideReason: override?.reason,
        // Task 10 — the server re-evaluates both and folds them into the
        // discount; these are requests, not authoritative totals.
        offerId: offerId && offerId !== "none" ? offerId : undefined,
        loyaltyRedeemPoints:
          loyaltyPoints > 0 && customerId ? Math.floor(loyaltyPoints) : undefined,
        items: billableItems.map((item) => {
          const packQty = packQtyOf(item);
          return {
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            batchId: item.batchId,
            hsnCode: item.hsnCode,
            quantity: packQty,                // pack (strip) units; fractional for loose units
            unit: item.unit,
            unitsPerPack: item.unitsPerPack, // lets print/history render "N strips + M tabs"
            mrp: item.mrp,
            rate: item.sellingPrice,          // selling price per pack
            amount: item.amount,              // packQty × sellingPrice
            gstRate: String(item.gstRate) as "0" | "5" | "12" | "18" | "28",
            gstAmount: item.gstAmount * packQty,
            cgst: item.cgst * packQty,
            sgst: item.sgst * packQty,
            discountAmount: item.discount * packQty,
          };
        }),
      });

      setLastInvoice({
        // The stored invoice is authoritative — getNextInvoiceNo is only a
        // preview and can differ from the number the server actually assigns
        // (install-wide sequence), which would print a wrong invoice number.
        invoiceNo: created?.data?.invoiceNo ?? invoiceNo,
        date,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        paymentMode: paymentMode || undefined,
        subtotal: baseAmount,
        totalGst: billableTotals.totalGst,
        cgst: billableTotals.cgst,
        sgst: billableTotals.sgst,
        igst: 0,
        discount: (billableClampedDiscount + offerDiscountPreview + loyaltyValuePreview) || undefined,
        grandTotal: billableGrandTotal,
        notes: notes || undefined,
        items: billableItems.map((item) => {
          const packQty = packQtyOf(item);
          return {
            medicineName: item.medicineName,
            hsnCode: item.hsnCode,
            quantity: packQty,
            unit: item.unit,
            unitsPerPack: item.unitsPerPack,
            rate: item.sellingPrice,
            mrp: item.mrp,
            amount: item.amount,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount * packQty,
            cgst: item.cgst * packQty,
            sgst: item.sgst * packQty,
          };
        }),
      });

      toast.success("Invoice created successfully");
      // Non-blocking near-expiry notices from the Expiry Safety Policy.
      if (created?.warnings?.length) {
        toast.info(created.warnings.map((w: any) => `${w.batchNo ? `Batch ${w.batchNo}: ` : ""}${w.reason}`).join(" · "));
      }
      // Task 6 — link and dispense the prescription against this invoice.
      // Best-effort: verify a still-pending prescription first (the server
      // refuses to dispense an unverified one), then dispense. Failures only
      // toast so the counter sale is never blocked by paperwork.
      if (prescriptionId) {
        try {
          const { prescriptionsApi } = await import("@/lib/api");
          if (prescription?.status === "pending") {
            await prescriptionsApi.verify(prescriptionId);
          }
          await prescriptionsApi.dispense(prescriptionId, created.data.id);
        } catch (err: any) {
          toast.error(err?.message ? `Prescription not dispensed — ${err.message}` : "Prescription not dispensed");
        }
      }
      // Task 14 — this bill was opened from an online order: after the invoice
      // exists, link + deliver the order (best-effort: a failed transition only
      // toasts — the invoice itself already succeeded).
      if (billingOrderId) {
        try {
          const { ordersApi } = await import("@/lib/api");
          await ordersApi.deliver(billingOrderId, created.data.id);
          toast.success("Order marked delivered");
        } catch {
          toast.error(
            "Invoice saved — but the order could not be marked delivered. Use Orders → Deliver.",
          );
        }
        setSearchParams({}, { replace: true });
        setBillingOrder(null);
      }
      // Customer is still at the counter — open the print preview immediately.
      setShowPrint(true);
      setItems([blankLine({ isNewRow: false })]);
      setCustomerId(undefined);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setDoctorId(undefined);
      clearPrescription();
      setDiscount(0);
      setOfferId("none");
      setOfferEval(null);
      setLoyaltyPoints(0);
      setPaymentMode("Cash");
      setNotes("");
      setSaleDate(new Date().toISOString().split("T")[0]);
      clearDraft();
    } catch (err: any) {
      if (err?.status === 400 && Array.isArray(err?.payload?.blocked)) {
        // Expiry Safety Policy refusal — list the blocked batches inline and
        // offer an override (admin/pharmacist) when the server allows it.
        setBlockedExpiry(err.payload.blocked);
      } else if (
        err?.status === 400 &&
        typeof err?.payload?.error === "string" &&
        err.payload.error.includes("Prescription required")
      ) {
        // Server-side scheduled-drug enforcement (authoritative over the
        // client-side pre-check — e.g. a schedule edited mid-bill).
        setRxRequiredItems(Array.isArray(err?.payload?.items) ? err.payload.items : []);
        setShowRxRequired(true);
      } else if (err?.status === 400 && typeof err?.payload?.error === "string") {
        // Offer / loyalty refusal (inactive offer, insufficient balance, …).
        setFormError(err.payload.error);
      } else {
        setFormError("Couldn't save this invoice — check your connection and try again. Nothing was billed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Counter keyboard flow: save, scan focus, add row. Refs keep the
  // once-registered hotkeys reading latest state (no stale closures). The
  // refs are synced in an effect — never written during render.
  const saveDisabledReasonRef = useRef(saveDisabledReason);
  const handleSubmitRef = useRef(handleSubmit);
  const addItemRef = useRef(addItem);
  useEffect(() => {
    saveDisabledReasonRef.current = saveDisabledReason;
    handleSubmitRef.current = handleSubmit;
    addItemRef.current = addItem;
  });
  useHotkeys([
    { key: "ctrl+s", label: "Save invoice", allowInInputs: true, handler: () => { if (!saveDisabledReasonRef.current) void handleSubmitRef.current(); } },
    { key: "/", label: "Focus scan bar", handler: () => document.querySelector<HTMLInputElement>('[aria-label="Scan barcode to add item"]')?.focus() },
    { key: "n", label: "Add bill row", handler: () => addItemRef.current() },
  ]);

  if (!isAuthenticated && !authLoading) {
    navigate("/auth");
    return null;
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-full min-h-0 flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">New Bill</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getNextInvoiceNo ? (
              <>
                Invoice{" "}
                <span className="font-mono font-medium text-foreground">
                  {getNextInvoiceNo}
                </span>{" "}
                · GST-ready
              </>
            ) : (
              "GST-ready billing"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8" onClick={() => void handleSubmit()} disabled={submitting || !!saveDisabledReason} title={saveDisabledReason || "Save invoice (Ctrl+S)"}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save Invoice
          </Button>
        </div>
      </div>
      {formError && (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs text-destructive" role="alert">
          {formError}
        </p>
      )}
      {billingOrder && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-primary/40 bg-primary/5 px-3 py-2"
          role="status"
        >
          <p className="text-xs">
            Billing order{" "}
            <span className="font-mono font-medium text-foreground">
              #{billingOrder.id.slice(0, 8)}
            </span>{" "}
            — {billingOrder.customerName}
            {billingOrder.phone ? ` · ${billingOrder.phone}` : ""} ·{" "}
            {Array.isArray(billingOrder.items) ? billingOrder.items.length : 0} item(s) · ₹
            {Number(billingOrder.subtotal ?? 0).toFixed(2)}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={() => {
              setSearchParams({}, { replace: true });
              setBillingOrder(null);
            }}
            title="Stop treating this bill as an order conversion"
          >
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        </div>
      )}
      {blockedExpiry && blockedExpiry.length > 0 && (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-1.5" role="alert">
          <p className="text-xs font-medium text-destructive">Blocked by expiry policy</p>
          <ul className="space-y-0.5">
            {blockedExpiry.map((b, i) => (
              <li key={`${b.batchNo ?? "line"}-${b.expiryDate}-${i}`} className="text-xs text-destructive/90">
                {b.batchNo ? `Batch ${b.batchNo} — ` : ""}exp {b.expiryDate} ({b.daysToExpiry}d) · {b.reason}
              </li>
            ))}
          </ul>
          {user && (user.role === "admin" || user.role === "pharmacist") && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={submitting}
              onClick={() => {
                const reason = window.prompt("Override reason (recorded in the audit trail):");
                if (!reason || !reason.trim()) return;
                // prescriptionOverride rides along so a dual block (expiry +
                // scheduled drug) doesn't bounce between the two dialogs.
                void handleSubmit({ reason: reason.trim(), prescriptionOverride: true });
              }}
            >
              Override &amp; save
            </Button>
          )}
        </div>
      )}

      {/* Customer — one compact line; details collapse away from the counter */}
      <Card className="shrink-0 border-border/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setShowCustomerPicker(true)}
          >
            <UserRound className="h-3 w-3 mr-1" />
            {customerName || "Walk-in Customer"}
          </Button>
          <Input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Phone"
            inputMode="tel"
            className="h-8 w-32"
            aria-label="Customer phone"
          />
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger className="h-8 w-32" aria-label="Payment mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Credit">Credit (Udhar)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={saleDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setSaleDate(e.target.value || new Date().toISOString().split("T")[0])}
            className="h-8 w-36 text-xs"
            aria-label="Sale date"
            title="Sale date — defaults to today"
          />
          {/* Batch issue order: FEFO (earliest expiry) or FIFO (oldest received) */}
          <div className="flex h-8 items-center rounded-md border border-input bg-background text-[11px]" role="group" aria-label="Batch issue order">
            {(["FEFO", "FIFO"] as const).map((o) => {
              const active = (o === "FEFO") === (batchOrder === "fefo");
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setBatchOrder(o === "FEFO" ? "fefo" : "fifo")}
                  aria-pressed={active}
                  title={o === "FEFO" ? "First expiry, first out" : "First in, first out (oldest received)"}
                  className={`h-full px-2 font-medium transition-colors first:rounded-l-md last:rounded-r-md ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {o}
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => setShowCustomerDetails((s) => !s)}
            aria-expanded={showCustomerDetails}
          >
            Details
            <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showCustomerDetails ? "rotate-180" : ""}`} />
          </Button>
          {customerId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={clearCustomer}
              title="Clear customer"
              aria-label="Clear customer"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {/* Scan-first entry — barcode straight into the bill */}
          <div className="ml-auto flex min-w-52 flex-1 items-center gap-1.5 sm:max-w-72">
            <Input
              value={scanCode}
              onChange={(e) => {
                setScanCode(e.target.value);
                if (scanError) setScanError("");
              }}
              data-enter="custom"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void scanIntoBill(scanCode);
                }
              }}
              placeholder="Scan barcode → adds to bill"
              className="h-8 font-mono text-xs"
              aria-label="Scan barcode to add item"
              autoFocus
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => void scanIntoBill(scanCode)}
              disabled={scanLoading || !scanCode.trim()}
            >
              {scanLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Barcode className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {scanError && (
          <p className="mt-1 text-xs text-destructive" role="alert">{scanError}</p>
        )}
        {showCustomerDetails && (
          <div className="mt-2 grid grid-cols-1 gap-2 border-t border-border/50 pt-2 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Customer Name</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
                className="h-8 mt-0.5"
              />
            </div>
            <div className="sm:col-span-4">
              <Label className="text-[11px] text-muted-foreground">Address</Label>
              <Input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Address"
                className="h-8 mt-0.5"
              />
            </div>
            <div className="sm:col-span-6">
              <Label className="text-[11px] text-muted-foreground">Doctor (optional)</Label>
              <div className="mt-0.5 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 flex-1 justify-start text-left font-normal"
                  onClick={() => setShowDoctorPicker(true)}
                >
                  <Stethoscope className="h-3 w-3 mr-1 text-muted-foreground" />
                  {doctorId
                    ? (doctors?.find((d: any) => d.id === doctorId)?.name
                      ?? serverDoctors?.find((d: any) => d.id === doctorId)?.name
                      ?? "Select doctor")
                    : "Select doctor"}
                </Button>
                {doctorId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearDoctor} aria-label="Clear doctor">
                    <X className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => setShowCustomerPicker(true)}
                  >
                    Full customer list
                  </Button>
                )}
              </div>
            </div>
            <div className="sm:col-span-6">
              <Label className="text-[11px] text-muted-foreground">Prescription (required for H/H1/X)</Label>
              <div className="mt-0.5 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 flex-1 justify-start text-left font-normal"
                  onClick={() => setShowRxPicker(true)}
                >
                  <ClipboardList className="h-3 w-3 mr-1 text-muted-foreground" />
                  {prescription
                    ? `${prescription.patientName}${prescription.doctorName ? ` · ${prescription.doctorName}` : ""}`
                    : "Select prescription"}
                </Button>
                {prescription && (
                  <>
                    <span
                      role="link"
                      tabIndex={0}
                      title="Open in Prescriptions"
                      onKeyDown={(e) => { if (e.key === "Enter") navigate("/dashboard/prescriptions"); }}
                      onClick={() => navigate("/dashboard/prescriptions")}
                      className={`inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border px-2 text-[10px] font-medium capitalize ${
                        prescription.status === "verified"
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : prescription.status === "dispensed"
                            ? "border-green-300 bg-green-50 text-green-700"
                            : prescription.status === "rejected"
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                      }`}
                    >
                      Rx · {prescription.status}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={clearPrescription} aria-label="Clear prescription">
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Line Items */}
      <Card className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5 sm:p-3 border-border/60">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Items
            <span className="ml-1.5 text-muted-foreground/60">{items.length}</span>
          </h3>
        </div>
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: "0 1px" }}>
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-16" />
              <col className="w-14" />
              <col className="w-14" />
              <col className="w-20" />
              <col className="w-14" />
              <col className="w-14" />
              <col className="w-24" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="text-xs font-medium text-muted-foreground">
                <th className="px-2 pb-1 text-left font-medium">Item</th>
                <th className="px-1 pb-1 text-center font-medium">Batch #</th>
                <th className="px-1 pb-1 text-center font-medium">Expiry</th>
                <th className="px-1 pb-1 text-center font-medium">Strips</th>
                <th className="px-1 pb-1 text-center font-medium">Loose</th>
                <th className="px-1 pb-1 text-right font-medium">MRP ₹</th>
                <th className="px-1 pb-1 text-center font-medium">GST %</th>
                <th className="px-1 pb-1 text-right font-medium">Disc ₹</th>
                <th className="px-1 pb-1 text-right font-medium">Rate ₹</th>
                <th className="px-1 pb-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
          {items.map((item, i) => (
            <motion.tr
              key={i}
              data-bill-row={i}
              initial={item.isNewRow ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`${item.error ? "bg-destructive/[0.03]" : ""}`}
            >
              {/* Item + batch */}
              <td className="rounded-l-sm border-y border-l border-border/40 px-1.5 py-1 align-top">
                <div className="flex items-start gap-1.5">
                  {item.schedule && /^(h1?|x)\b/i.test(item.schedule) && (
                    <span
                      className="mt-1.5 shrink-0 rounded-sm bg-purple-100 px-1 py-0.5 text-[10px] font-semibold leading-none text-purple-800"
                      title={`Schedule ${item.schedule} — prescription medicine`}
                    >
                      Rx
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <RowMedicineInput
                      rowIndex={i}
                      value={item.medicineName}
                      active={activeRow === i}
                      onFocus={() => setActiveRow(i)}
                      onBlur={() => setActiveRow((cur) => (cur === i ? null : cur))}
                      onChange={(v) => {
                        // Retyping a picked row unpicks it — back to a searchable line.
                        if (item.medicineId) {
                          setItems((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], medicineId: undefined, batchId: undefined, batchNo: undefined, expiryDate: undefined, availableBatches: undefined, schedule: undefined, packSizeLabel: undefined };
                            return next;
                          });
                        }
                        updateItem(i, "medicineName", v);
                      }}
                      onPickStock={(med) => void pickStockForRow(i, med)}
                      onPickCatalog={(entry) => void pickCatalogForRow(i, entry)}
                    />
                    {item.packSizeLabel && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={`Pack: ${item.packSizeLabel}`}>
                        {item.packSizeLabel}
                      </p>
                    )}
                  </div>
                </div>
                {item.error && (
                  <p className="mt-1 text-xs text-destructive" role="alert">{item.error}</p>
                )}
              </td>
              {/* Batch # — visible box: type a batch # or pick a FEFO batch */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                {item.medicineId ? (
                  <>
                    <Input
                      value={item.batchNo ?? ""}
                      data-cell="batch"
                      fit
                      placeholder="Batch #"
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => {
                          const next = [...prev];
                          const row = next[i];
                          // Typing detaches from the FEFO batch; matching an
                          // available batch re-attaches (MRP/cost follow it).
                          const match = (row.availableBatches ?? []).find(
                            (b) => !b.isExpired && b.quantity > 0 && b.batchNo.toLowerCase() === v.trim().toLowerCase(),
                          );
                          if (match && v.trim()) {
                            const ratio = row.mrp > 0 ? row.sellingPrice / row.mrp : 1;
                            const sellingPrice = Math.max(0, Math.min(match.mrp, match.mrp * ratio));
                            const { gstAmount, cgst, sgst } = calcGSTFromSellingPrice(sellingPrice, row.gstRate);
                            next[i] = recomputeItem({
                              ...row,
                              batchId: match.id,
                              batchNo: match.batchNo,
                              expiryDate: match.expiryDate,
                              mrp: match.mrp,
                              purchasePrice: match.purchasePrice,
                              sellingPrice,
                              gstAmount,
                              cgst,
                              sgst,
                              isBelowFloor: isBelowFloor(match.purchasePrice, sellingPrice, row.gstRate),
                              error: undefined,
                            });
                          } else {
                            next[i] = { ...row, batchId: match?.id, batchNo: v, error: undefined };
                          }
                          return next;
                        });
                      }}
                      onFocus={() => void ensureBatches(i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Typed batch that matches nothing on file → offer add-stock.
                          const typed = (item.batchNo ?? "").trim();
                          const hasMatch = (item.availableBatches ?? []).some(
                            (b) => !b.isExpired && b.quantity > 0 && b.batchNo.toLowerCase() === typed.toLowerCase(),
                          );
                          if (typed && !hasMatch && !item.batchId) {
                            openStockPrompt(i, { id: item.medicineId, name: item.medicineName }, typed);
                            return;
                          }
                          focusCell(i, "expiry");
                        }
                      }}
                      className="h-8 px-1.5 font-mono text-xs uppercase"
                      aria-label={`Row ${i + 1} batch number — type or pick FEFO batch (Enter for Expiry)`}
                      list={`bill-batches-${i}`}
                    />
                    <datalist id={`bill-batches-${i}`}>
                      {(item.availableBatches ?? [])
                        .filter((b) => !b.isExpired && b.quantity > 0)
                        .map((b) => (
                          <option key={b.id} value={b.batchNo}>
                            exp {formatExpiry(b.expiryDate)} · {formatPackQty(b.quantity, item.unitsPerPack)}
                          </option>
                        ))}
                    </datalist>
                  </>
                ) : (
                  <p className="h-8 rounded-sm border border-dashed border-border/60 px-1 text-center text-[10px] leading-8 text-muted-foreground/60">—</p>
                )}
              </td>
              {/* Expiry — editable MM/YY box following the batch */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <ExpiryMMYYInput
                  value={item.expiryDate}
                  disabled={!item.medicineId}
                  dataCell="expiry"
                  onCommit={(full) => {
                    setItems((prev) => {
                      const next = [...prev];
                      next[i] = { ...next[i], expiryDate: full || next[i].expiryDate, error: undefined };
                      return next;
                    });
                  }}
                  onEnter={() => focusCell(i, "strips")}
                  ariaLabel={`Row ${i + 1} expiry as MM/YY (Enter for Strips)`}
                  className={`h-8 px-1 text-center font-mono text-xs tabular-nums ${(() => { const d = daysToExpiry(item.expiryDate); if (d !== null && d < 0) return "border-red-300 bg-red-50 font-medium text-red-700"; if (d !== null && d <= 90) return "font-medium text-amber-700"; return "text-muted-foreground"; })()}`}
                  title={(() => {
                    const d = daysToExpiry(item.expiryDate);
                    if (d === null) return "Expiry follows the batch — editable";
                    if (d < 0) return "Expired batch";
                    if (d <= 90) return `${d} days left`;
                    return "Expiry follows the batch — editable";
                  })()}
                />
              </td>
              {/* Strips */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <Input
                  type="number"
                  min={0}
                  step={1}
                      value={item.sellUnit === "pack" ? item.quantity : Math.floor(item.quantity / Math.max(1, item.unitsPerPack || 1))}
                      data-cell="strips"
                  onChange={(e) => {
                    const strips = Math.max(0, Number(e.target.value));
                    if (item.sellUnit === "pack") {
                      updateItem(i, "quantity", strips);
                    } else {
                      const upp = Math.max(1, item.unitsPerPack || 1);
                      const loose = Math.max(0, Math.round(item.quantity % upp));
                      setRowQty(i, strips * upp + loose, "loose");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focusCell(i, "loose");
                    }
                  }}
                  className="h-8 px-1 text-sm text-center tabular-nums"
                  aria-label={`Row ${i + 1} strips (Enter for Loose)`}
                />
              </td>
              {/* Loose */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={item.sellUnit === "loose" ? Math.max(0, Math.round(item.quantity % Math.max(1, item.unitsPerPack || 1))) : 0}
                  data-cell="loose"
                  onChange={(e) => {
                    const loose = Math.max(0, Number(e.target.value));
                    const upp = Math.max(1, item.unitsPerPack || 1);
                    if (item.sellUnit === "loose") {
                      const strips = Math.floor(item.quantity / upp);
                      setRowQty(i, strips * upp + loose, "loose");
                    } else {
                      // First loose entry flips the row to loose mode.
                      setRowQty(i, Math.max(0, Math.round(item.quantity)) + loose, "loose");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focusCell(i, "mrp");
                    }
                  }}
                  className="h-8 px-1 text-sm text-center tabular-nums"
                  aria-label={`Row ${i + 1} loose tablets (Enter for MRP)`}
                />
              </td>
              {/* MRP */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <MoneyInput
                  value={item.mrp}
                  dataCell="mrp"
                  fit
                  onCommit={(v) => updateItem(i, "mrp", v)}
                  onEnter={() => focusCell(i, "disc")}
                  ariaLabel={`Row ${i + 1} MRP per pack, includes GST (Enter for Discount)`}
                  title="MRP ₹ per pack (incl. GST)"
                />
              </td>
              {/* GST */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <Select
                  value={item.gstRate > 0 ? String(item.gstRate) : ""}
                  onValueChange={(v) => updateItem(i, "gstRate", Number(v) as 0 | 5 | 12 | 18 | 28)}
                >
                  <SelectTrigger className={`h-8 px-1.5 text-xs tabular-nums ${item.gstRate > 0 ? "" : "text-muted-foreground/60"}`} aria-label={`Row ${i + 1} GST rate${item.gstRate > 0 ? "" : " — auto-fills from inventory"}`}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.filter((r) => r > 0).map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              {/* Discount per pack — feeds Rate = MRP − disc */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <MoneyInput
                  value={item.discount}
                  dataCell="disc"
                  fit
                  onCommit={(v) => updateItem(i, "sellingPrice", Math.max(0, item.mrp - v))}
                  onEnter={() => focusCell(i, "sell")}
                  ariaLabel={`Row ${i + 1} discount per pack (Enter for Rate)`}
                  title="Discount ₹ per pack — Rate = MRP − discount"
                />
              </td>
              {/* Rate (editable) + margin reference */}
              <td className="border-y border-border/40 px-1.5 py-1 align-top">
                <MoneyInput
                  value={item.sellingPrice}
                  dataCell="sell"
                  fit
                  onCommit={(v) => updateItem(i, "sellingPrice", v)}
                  onEnter={() => {
                    if (i >= items.length - 1) addItem();
                    else focusCell(i + 1, "item");
                  }}
                  ariaLabel={`Row ${i + 1} rate per pack (Enter for next row)`}
                  title="Rate ₹ per pack (incl. GST) — discount auto-derives from MRP"
                />
              </td>
              {/* Amount + delete */}
              <td className="rounded-r-sm border-y border-r border-border/40 px-1.5 py-1 align-top">
                <div className="flex h-8 items-center justify-end gap-1 min-w-0">
                  <FitText
                    value={`₹${item.amount.toFixed(2)}`}
                    className="text-sm font-semibold flex-1 text-right"
                    maxPx={12}
                    minPx={10.5}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(i)}
                    aria-label={`Remove row ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <FitText
                  value={
                    item.sellingPrice > 0
                      ? `${((((item.sellingPrice - item.purchasePrice * (1 + item.gstRate / 100)) / item.sellingPrice) * 100).toFixed(1))}% margin${item.isBelowFloor ? " · Loss" : ""}${item.sellUnit === "loose" ? ` · ₹${unitRateOf(item).toFixed(2)}/tab` : ""}`
                      : "—"
                  }
                  title={item.isBelowFloor ? "Selling below purchase price — raise Rate before saving" : "Margin over purchase price (incl. GST)"}
                  className={`text-right tabular-nums mt-0.5 ${item.isBelowFloor ? "font-medium text-red-600" : "text-muted-foreground"}`}
                  maxPx={10}
                  minPx={9}
                />
              </td>
            </motion.tr>
          ))}
            </tbody>
          </table>

          <Button variant="outline" size="sm" onClick={addItem} className="mt-0.5" title="Add another row (Enter in Rate also adds one)">
            <Plus className="h-3 w-3 mr-1" />
            Add row
          </Button>
        </div>
      </Card>

      {/* Notes — pinned below items so it never scrolls away with rows */}
      <div className="shrink-0 px-0.5">
        <Label className="text-[11px] text-muted-foreground" htmlFor="bill-notes">Notes</Label>
        <Textarea
          id="bill-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes — printed on the invoice"
          className="mt-0.5 min-h-9 text-xs"
          rows={1}
        />
      </div>

      {/* Totals — frozen footer */}
      <Card className="shrink-0 p-3 sm:p-4 border-border/60">
        {/* Offer / Loyalty (Task 10) — folded into the bill discount */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-border/50 pb-2.5 mb-2.5">
          <div className="min-w-[190px]">
            <Label className="text-[10px] text-muted-foreground" htmlFor="bill-offer">Offer</Label>
            <Select value={offerId} onValueChange={setOfferId}>
              <SelectTrigger id="bill-offer" className="h-7 text-xs mt-0.5">
                <SelectValue placeholder="No offer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No offer</SelectItem>
                {activeOffers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.type === "percent" ? `${o.value}%` : `₹${o.value}`})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground" htmlFor="bill-loyalty-points">
              Loyalty points
              {customerId
                ? loyaltyBalance !== null
                  ? ` · balance ${loyaltyBalance}`
                  : " · loading…"
                : " · pick a customer"}
            </Label>
            <Input
              id="bill-loyalty-points"
              type="number"
              min={0}
              value={loyaltyPoints}
              disabled={!customerId}
              onChange={(e) => setLoyaltyPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="h-7 w-24 text-xs mt-0.5 text-right"
              aria-label="Loyalty points to redeem"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] min-h-5">
            {offerId !== "none" && offerEval && (
              offerEval.applies ? (
                <span className="text-green-700 font-medium">
                  Offer −₹{offerDiscountPreview.toFixed(2)}
                </span>
              ) : (
                <span className="text-amber-600" title="This offer will not apply to the current bill">
                  <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />
                  {offerEval.reason ?? "Offer does not apply"}
                </span>
              )
            )}
            {loyaltyPoints > 0 && (
              <span className={loyaltyBalance !== null && loyaltyPoints > loyaltyBalance ? "text-red-600" : "text-green-700"}>
                {loyaltyBalance !== null && loyaltyPoints > loyaltyBalance
                  ? `Exceeds balance (${loyaltyBalance})`
                  : `Loyalty −₹${loyaltyValuePreview.toFixed(2)} (${loyaltyPoints} pts)`}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">MRP</span>
              <span className="tabular-nums font-medium">₹{totals.totalMrp.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">₹{totals.totalGst.toFixed(2)}</span>
              <span className="text-muted-foreground/70">
                (C ₹{totals.cgst.toFixed(2)} / S ₹{totals.sgst.toFixed(2)})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-green-700">
              <span className="text-muted-foreground">You save</span>
              <span className="tabular-nums font-medium">₹{totals.totalSavings.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground" title="Flat rupees off the whole bill (not per pack)">Bill discount ₹</span>
              <Input
                type="number"
                min={0}
                max={totals.subtotal}
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                data-enter="custom"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!saveDisabledReason) void handleSubmit();
                  }
                }}
                className="h-7 w-20 text-sm text-right"
                aria-label="Bill discount in rupees, capped at subtotal"
              />
              {discount > totals.subtotal && (
                <span className="text-[11px] text-amber-600">capped at subtotal</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            {totals.belowFloorItems > 0 && (
              <span className="hidden items-center gap-1 text-xs font-medium text-red-700 sm:inline-flex" role="alert" title="Selling below purchase price">
                <AlertTriangle className="h-3.5 w-3.5" /> {totals.belowFloorItems} loss item{totals.belowFloorItems > 1 ? "s" : ""}
              </span>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums leading-none">
                ₹
                <AnimatedNumber value={grandTotal} format={(n) => n.toFixed(2)} />
              </span>
            </div>
          </div>
        </div>
        {totals.belowFloorItems > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-sm border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 sm:hidden" role="alert">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {totals.belowFloorItems} item{totals.belowFloorItems > 1 ? "s" : ""} selling below purchase price — you will make a loss!
          </div>
        )}
        {paymentMode === "Credit" && (
          <p className="mt-1.5 text-xs text-muted-foreground sm:text-right">
            Credit sale — marked{" "}
            <span className="font-medium text-foreground">unpaid</span> and tracked in
            payment outstanding.
          </p>
        )}
      </Card>

      {/* Add-stock popup — zero stock or unknown batch → inventory, then bill */}
      <Dialog
        open={stockPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStockPrompt(null);
            if (stockPrompt) focusQty(stockPrompt.rowIdx);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              Add stock — then bill it
            </DialogTitle>
            <DialogDescription>
              {stockPrompt?.typedBatchNo
                ? `Batch "${stockPrompt.typedBatchNo}" isn't on file for ${stockPrompt?.medicineName}. Add it to inventory below — the row fills in and billing continues.`
                : `${stockPrompt?.medicineName} has no sellable stock. Add a batch below — the row fills in and billing continues.`}
            </DialogDescription>
          </DialogHeader>

          {/* Alternatives: the medicine has no sellable stock — dispense a
              same-salt / same-composition substitute from your own stock. */}
          {stockPrompt?.medicineId && (
            <div className="border-t pt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" /> Find alternatives in your stock
              </p>
              <div className="max-h-44 overflow-y-auto pr-0.5">
                <MedicineAlternatives
                  medicineId={stockPrompt.medicineId}
                  inStock
                  maxRows={3}
                  onUse={(alt) => {
                    const rowIdx = stockPrompt.rowIdx;
                    setStockPrompt(null);
                    toast(`Switched to ${alt.name}`, {
                      description: `₹${alt.sellingPrice.toFixed(2)} · ${alt.stockPacks} in stock · schedule ${alt.schedule ?? "—"} from its item master.`,
                    });
                    void pickStockForRow(rowIdx, { ...alt, id: alt.medicineId, _id: alt.medicineId });
                  }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Medicine</Label>
              <Input value={stockPrompt?.medicineName ?? ""} readOnly tabIndex={-1} className="mt-1 h-9 bg-secondary/30" />
            </div>
            <div>
              <Label className="text-xs">Batch # *</Label>
              <Input
                value={stockForm.batchNo}
                onChange={(e) => setStockForm((f) => ({ ...f, batchNo: e.target.value.toUpperCase() }))}
                placeholder="e.g. BTH042"
                className="mt-1 h-9 font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Expiry (MM/YY) *</Label>
              <Input
                value={stockForm.expiryDate}
                placeholder="MM/YY"
                inputMode="numeric"
                maxLength={5}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                  let masked = digits;
                  if (digits.length >= 3) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                  if (masked.length >= 2) {
                    const mm = Math.min(12, Math.max(1, Number(masked.slice(0, 2)) || 1));
                    masked = `${String(mm).padStart(2, "0")}${masked.slice(2)}`;
                  }
                  setStockForm((f) => ({ ...f, expiryDate: masked }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
                className="mt-1 h-9 tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Strips *</Label>
              <Input
                type="number"
                min={0}
                value={stockForm.strips}
                onChange={(e) => setStockForm((f) => ({ ...f, strips: Math.max(0, Number(e.target.value)) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
                className="mt-1 h-9 text-center tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Loose tabs</Label>
              <Input
                type="number"
                min={0}
                value={stockForm.loose}
                onChange={(e) => setStockForm((f) => ({ ...f, loose: Math.max(0, Number(e.target.value)) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
                className="mt-1 h-9 text-center tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">MRP ₹/strip *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={stockForm.mrp}
                onChange={(e) => setStockForm((f) => {
                  const mrp = Math.max(0, Number(e.target.value));
                  return { ...f, mrp, sellingPrice: f.sellingPrice > mrp ? mrp : f.sellingPrice };
                })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
                className="mt-1 h-9 text-right tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Sell ₹/strip *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={stockForm.sellingPrice}
                onChange={(e) => setStockForm((f) => ({ ...f, sellingPrice: Math.max(0, Number(e.target.value)) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextField(e.currentTarget);
                  }
                }}
                className="mt-1 h-9 text-right tabular-nums"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Purchase ₹/strip</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={stockForm.purchasePrice}
                onChange={(e) => setStockForm((f) => ({ ...f, purchasePrice: Math.max(0, Number(e.target.value)) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // Last box → save directly when valid, else land on the primary button.
                    if (stockForm.batchNo.trim() && stockForm.expiryDate && (stockForm.strips > 0 || stockForm.loose > 0) && stockForm.mrp > 0) {
                      void confirmAddStock();
                    } else {
                      focusNextField(e.currentTarget);
                    }
                  }
                }}
                className="mt-1 h-9 text-right tabular-nums"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Cost reference — flags a Loss if Sell drops below it.</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              disabled={stockSaving || !stockForm.batchNo.trim() || !stockForm.expiryDate || (stockForm.strips <= 0 && stockForm.loose <= 0) || stockForm.mrp <= 0}
              onClick={() => void confirmAddStock()}
            >
              {stockSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <PackagePlus className="h-3.5 w-3.5 mr-1.5" />}
              Add stock & bill it
            </Button>
            <Button variant="outline" onClick={() => {
              setStockPrompt(null);
              if (stockPrompt) focusQty(stockPrompt.rowIdx);
            }}>
              Skip
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode Dialog — search now lives in the row's Item box */}
      <Dialog
        open={showMedPicker}
        onOpenChange={(open) => {
          if (!open) closeMedPicker();
          else setShowMedPicker(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Scan Barcode{pickerIndex !== null ? ` — row ${pickerIndex + 1}` : ""}
            </DialogTitle>
            <DialogDescription>
              Scan a barcode into the bill · Esc to close
            </DialogDescription>
          </DialogHeader>

          {/* Barcode section */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                data-enter="custom"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookupBarcode(barcode);
                  }
                }}
                placeholder="Type or scan barcode code"
                className="h-9 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void lookupBarcode(barcode)}
                disabled={barcodeLoading || !barcode.trim()}
              >
                {barcodeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Barcode className="h-3.5 w-3.5" />
                )}
                Find
              </Button>
              <Button
                size="sm"
                className="shrink-0"
                variant={showScanner ? "secondary" : "default"}
                onClick={() => {
                  setBarcodeError("");
                  setShowScanner((s) => !s);
                }}
                disabled={barcodeLoading}
              >
                {showScanner ? "Stop" : "Scan"}
              </Button>
            </div>
            {barcodeError && (
              <p className="text-xs text-destructive">{barcodeError}</p>
            )}
            <BarcodeCameraScanner
              active={showScanner}
              onScan={(code) => {
                setShowScanner(false);
                void lookupBarcode(code);
              }}
              onError={(msg) => setBarcodeError(msg)}
              className="w-full overflow-hidden rounded-sm border border-border/60 bg-black [&_video]:w-full"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: type in the row's Item box — search happens right there. Scan bar above for barcodes.
          </p>
        </DialogContent>
      </Dialog>

      {/* Customer Picker Dialog */}
      <Dialog
        open={showCustomerPicker}
        onOpenChange={setShowCustomerPicker}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer</DialogTitle>
            <DialogDescription>
              Choose a customer to auto-fill their details
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="mb-2 pr-9"
              autoFocus
            />
            {custSearching ? (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
            ) : (
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {custSearching && custPickerList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />Searching…
              </p>
            )}
            {custPickerList.map((c: any) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-secondary transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{c.name}</span>
                  {c.phone && (
                    <span className="text-muted-foreground ml-1">
                      {c.phone}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.totalPurchases || 0} purchases
                </div>
              </button>
            ))}
            {!custSearching && custPickerList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No customers found. Add them in Customers first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Doctor Picker Dialog */}
      <Dialog
        open={showDoctorPicker}
        onOpenChange={setShowDoctorPicker}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Doctor</DialogTitle>
            <DialogDescription>
              Search by name, clinic, or specialization
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={doctorSearch}
              onChange={(e) => setDoctorSearch(e.target.value)}
              placeholder="Search doctors..."
              className="mb-2 pr-9"
              autoFocus
            />
            {doctorSearching ? (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
            ) : (
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            <p className="px-3 pb-1 text-[11px] text-muted-foreground">
              No doctor? Use the X next to the doctor field on the bill to clear it.
            </p>
            {doctorPickerList.map((d: any) => (
              <button
                key={d.id}
                onClick={() => selectDoctor(d)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-secondary transition-colors"
              >
                <span className="font-medium">{d.name}</span>
                {d.clinicName && (
                  <span className="text-muted-foreground ml-1">{d.clinicName}</span>
                )}
              </button>
            ))}
            {!doctorSearching && doctorPickerList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No doctors found. Add them in Doctors first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Prescription Picker Dialog (Task 6) */}
      <Dialog
        open={showRxPicker}
        onOpenChange={(open) => {
          setShowRxPicker(open);
          if (!open) {
            setRxSearch("");
            setRxNewOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Prescription</DialogTitle>
            <DialogDescription>
              Open (pending/verified) prescriptions — or capture a new one right here.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={rxSearch}
              onChange={(e) => setRxSearch(e.target.value)}
              placeholder="Search patient, doctor or notes..."
              className="mb-2 pr-9"
              autoFocus
            />
            {rxSearching ? (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
            ) : (
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {rxResults.map((p: any) => (
              <button
                key={p.id}
                onClick={() => selectPrescription(p)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-secondary transition-colors"
              >
                <span className="font-medium">{p.patientName}</span>
                <span className="text-muted-foreground ml-1 text-xs">
                  {[p.patientAge, p.patientGender, p.doctorName, p.date].filter(Boolean).join(" · ")}
                </span>
                <span
                  className={`float-right rounded-full border px-1.5 text-[10px] capitalize ${
                    p.status === "verified"
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  {p.status}
                </span>
              </button>
            ))}
            {!rxSearching && rxResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No open prescriptions found.
              </p>
            )}
          </div>

          {/* Inline mini-form: capture a prescription without leaving the bill */}
          {!rxNewOpen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setRxNewOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New prescription
            </Button>
          ) : (
            <div className="rounded-sm border border-border/60 p-3 space-y-2">
              <div>
                <Label className="text-xs">Patient name *</Label>
                <Input
                  value={rxNewName}
                  onChange={(e) => setRxNewName(e.target.value)}
                  placeholder="Patient name"
                  className="mt-1 h-8"
                />
              </div>
              <div>
                <Label className="text-xs">Prescription image (optional)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  className="mt-1 h-8 text-xs"
                  onChange={(e) => setRxNewImage(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={rxNewSaving || !rxNewName.trim()}
                  onClick={() => void createAndSelectPrescription()}
                >
                  {rxNewSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Create &amp; attach
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRxNewOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scheduled-drug gate (Task 6): H/H1/X without a prescription */}
      <Dialog open={showRxRequired} onOpenChange={setShowRxRequired}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prescription required</DialogTitle>
            <DialogDescription>
              This bill contains scheduled drugs (H/H1/X). Attach a prescription,
              or override if your role allows it.
            </DialogDescription>
          </DialogHeader>
          {rxRequiredItems.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {rxRequiredItems.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-primary" />
                  {name}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setShowRxRequired(false);
                setShowRxPicker(true);
              }}
            >
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Attach / create prescription
            </Button>
            {user && (user.role === "admin" || user.role === "pharmacist") && (
              <Button
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setShowRxRequired(false);
                  void handleSubmit({ prescriptionOverride: true });
                }}
              >
                Override &amp; save
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowRxRequired(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Overrides are recorded in the audit trail (invoice.prescription_override).
          </p>
        </DialogContent>
      </Dialog>

      {/* Success banner with print option */}
      {lastInvoice && !showPrint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-sm border border-border/60 bg-secondary/30 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Invoice {lastInvoice.invoiceNo} created successfully
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setShowPrint(true)}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print / reprint invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLastInvoice(null)}
            >
              Dismiss
            </Button>
          </div>
        </motion.div>
      )}

      {/* Print Preview — honors Settings → Print prefs */}
      {showPrint && lastInvoice && (
        <PrintContainer
          onClose={() => setShowPrint(false)}
          paper={printPrefs.paper}
          previewLabel={printPrefs.paper === "laser-a4" ? "A4 Laser" : printPrefs.paper === "thermal-80" ? "80mm Thermal" : "58mm Thermal"}
        >
          <GSTInvoiceTemplate
            invoice={lastInvoice}
            shopName={printShop.name || undefined}
            shopAddress={printShop.address || undefined}
            shopGstin={printShop.gstin || undefined}
            shopPhone={printShop.phone || undefined}
            paper={printPrefs.paper}
            layout={printPrefs.layout}
            shopLogoDataUrl={printPrefs.logoDataUrl}
            showLogo={printPrefs.showLogo}
            showHsn={printPrefs.showHsn}
            showMrp={printPrefs.showMrp}
            showTaxTable={printPrefs.showTaxTable}
            showSavings={printPrefs.showSavings}
            showNotes={printPrefs.showNotes}
            showTerms={printPrefs.showTerms}
            footerText={printPrefs.footerText}
          />
        </PrintContainer>
      )}
    </motion.div>
  );
}
