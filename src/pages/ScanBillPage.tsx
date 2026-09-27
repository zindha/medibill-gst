import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Camera, CheckCircle2, Loader2, PackagePlus, ScanLine, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GST_RATES = [0, 5, 12, 18, 28];

interface LineItem {
  name: string;
  quantity: number;
  rate: number;
  gstRate: number;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
}

export default function ScanBillPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [ocrResult, setOcrResult] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [billNo, setBillNo] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const processImage = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => { setImagePreview(ev.target?.result as string); };
    reader.readAsDataURL(file);

    setScanning(true);
    setOcrResult("");
    setImported(false);
    setImportSummary("");

    try {
      const Tesseract = await import("tesseract.js");
      const { data: { text } } = await Tesseract.recognize(file, "eng");
      setOcrResult(text);

      // Try to extract data from OCR text using simple patterns
      const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const items: LineItem[] = [];
      const ratePattern = /(\d+(?:\.\d+)?)\s*(?:\/|\s+per|\s+rate|\s+₹)/i;
      const qtyPattern = /(\d+)\s*(?:qty|qty\.|qty:|nos?|strips?|boxes?)/i;
      const gstPattern = /(?:gst|gst\+|vat)\s*[:\-]?\s*(\d+)%?/i;

      for (const line of lines) {
        // Skip header/footer lines
        if (/supplier|bill|date|invoice|total|gst|subtotal/i.test(line) && !ratePattern.test(line)) continue;
        if (/^\d+\s*$/.test(line)) continue;

        // Try to extract a medicine name and price
        const priceMatch = line.match(/(?:₹|\Rs\.?)\s*(\d+(?:\.\d{1,2})?)/);
        const qtyMatch = line.match(/(\d+)\s*(?:qty|nos?|strips?|boxes?)/i);

        if (priceMatch) {
          const rate = parseFloat(priceMatch[1]);
          const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          const gstMatch = gstPattern.exec(line);
          const gst = gstMatch ? parseInt(gstMatch[1]) : 12;

          // Clean up name - take text before the price
          const name = line.replace(/(?:₹|\Rs\.?)\s*\d+(?:\.\d+)?/gi, "").replace(/\d+\s*(?:qty|nos?|strips?|boxes?)/gi, "").replace(/[^\w\s\-().]/g, "").trim();
          if (name && name.length > 2) {
            items.push({ name, quantity, rate, gstRate: gst });
          }
        }
      }

      if (items.length > 0) {
        setLineItems(items);
        toast.success(`Found ${items.length} line ${items.length === 1 ? "item" : "items"} — review before importing`);
      } else {
        // Fallback: add a blank row
        setLineItems([{ name: "", quantity: 1, rate: 0, gstRate: 12 }]);
        toast.warning("No items auto-detected — add them manually below");
      }
    } catch (error) {
      console.error("OCR error:", error);
      toast.error("OCR failed. You can add items manually.");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
  }, [processImage]);

  const handleUseCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      // For simplicity, just trigger the file input
      fileInputRef.current?.click();
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleAddRow = () => {
    setLineItems(prev => [...prev, { name: "", quantity: 1, rate: 0, gstRate: 12 }]);
  };

  const handleImport = async () => {
    const valid = lineItems.filter(i => i.name.trim() && i.quantity > 0 && i.rate >= 0);
    if (valid.length === 0) { toast.error("No valid items to import"); return; }
    if (!supplierName.trim()) { toast.error("Enter a supplier name"); return; }

    setImporting(true);
    try {
      const { medicinesApi } = await import("@/lib/api");
      let created = 0, updated = 0;

      for (const item of valid) {
        // Try to find existing medicine by name
        const existing = await medicinesApi.list({ search: item.name, limit: 5 });
        const list = Array.isArray(existing) ? existing : (existing?.data ?? []);
        const match = list.find((m: any) => m.name.toLowerCase() === item.name.toLowerCase());

        if (match) {
          // Update existing medicine - just update purchase price and GST if different
          if (match.purchasePrice !== item.rate || match.gstRate !== String(item.gstRate)) {
            await medicinesApi.update(match.id, {
              purchasePrice: item.rate,
              gstRate: String(item.gstRate) as any,
            });
          }
          updated++;
        } else {
          // Create new medicine
          await medicinesApi.create({
            name: item.name,
            purchasePrice: item.rate,
            sellingPrice: item.mrp && item.mrp > item.rate ? item.mrp : item.rate * 1.15,
            mrp: item.mrp ?? item.rate * 1.5,
            gstRate: String(item.gstRate) as any,
            quantity: item.quantity,
            minQuantity: 10,
          });
          created++;
        }
      }

      setImported(true);
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} new medicine${created === 1 ? "" : "s"} created`);
      if (updated > 0) parts.push(`${updated} existing medicine${updated === 1 ? "" : "s"} updated`);
      setImportSummary(parts.join(" · ") + ".");
      toast.success("Medicines imported to inventory");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  useState(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  });

  if (authLoading) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scan Bill</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Use OCR to scan a supplier bill and import medicines into inventory</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/purchase-import")}>
          <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
          Use in Purchase Import
        </Button>
      </div>

      {/* Upload */}
      <Card className="p-6 border-border/60">
        <div className="space-y-4">
          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="Bill preview" className="w-full rounded-sm border border-border/60 object-contain max-h-80" />
              {scanning && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Running OCR...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md mx-auto border-2 border-dashed border-border rounded-sm p-12 text-center">
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}>
                <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              </motion.div>
              <p className="text-sm text-muted-foreground mb-1">Upload a bill image or use your camera</p>
              <p className="text-xs text-muted-foreground/60">Supports JPG, PNG — Max 10MB</p>
            </motion.div>
          )}

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
              <Upload className="h-4 w-4 mr-2" />Upload Image
            </Button>
            <Button onClick={handleUseCamera} disabled={scanning}>
              <Camera className="h-4 w-4 mr-2" />Use Camera
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={handleFileUpload} />
        </div>
      </Card>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[{ n: "1", title: "Capture", desc: "Snap the supplier bill with your camera or upload a photo." },
          { n: "2", title: "Review", desc: "OCR extracts items — fix anything in the preview." },
          { n: "3", title: "Import", desc: "Medicines are created or updated in your inventory." }].map(s => (
          <motion.div key={s.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="flex items-start gap-3 border border-border/60 rounded-sm p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{s.n}</span>
            <div><p className="text-sm font-medium">{s.title}</p><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p></div>
          </motion.div>
        ))}
      </div>

      {/* Items */}
      {lineItems.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Supplier info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Supplier Name *</label>
              <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Bill Number</label>
              <Input value={billNo} onChange={e => setBillNo(e.target.value)} placeholder="Bill/Invoice number" />
            </div>
          </div>

          <Card className="p-5 border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Items to Import</h3>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={handleAddRow}>
                <PackagePlus className="h-3.5 w-3.5 mr-1" />Add Row
              </Button>
            </div>

            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 mb-1">
              <div className="col-span-5">Medicine</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-2 text-right">Rate (₹)</div>
              <div className="col-span-1 text-center">GST%</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 rounded-sm border border-border/40">
                  <div className="col-span-12 sm:col-span-5">
                    <Input value={item.name} onChange={e => updateLineItem(i, "name", e.target.value)}
                      placeholder="Medicine name" className="h-8 text-sm" />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Input type="number" min={1} value={item.quantity}
                      onChange={e => updateLineItem(i, "quantity", Math.max(1, Number(e.target.value)))}
                      className="h-8 text-sm text-center" />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Input type="number" min={0} step={0.01} value={item.rate}
                      onChange={e => updateLineItem(i, "rate", Number(e.target.value))}
                      className="h-8 text-sm text-right" />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Select value={String(item.gstRate)} onValueChange={v => updateLineItem(i, "gstRate", Number(v))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right text-sm font-medium pt-1.5 sm:pt-0">
                    ₹{(item.quantity * item.rate).toFixed(2)}
                  </div>
                  <div className="col-span-3 sm:col-span-1 flex justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLineItem(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-medium text-foreground">₹{lineItems.reduce((s, i) => s + i.quantity * i.rate, 0).toFixed(2)}</span>
              </p>
              <div className="flex items-center gap-2">
                {importSummary && <p className="text-xs text-green-700">{importSummary}</p>}
                <Button onClick={() => void handleImport()} disabled={importing || imported || lineItems.length === 0}>
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <PackagePlus className="h-3.5 w-3.5 mr-1.5" />}
                  {imported ? "Imported ✓" : "Import to Inventory"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Raw OCR */}
          {ocrResult && (
            <Card className="p-5 border-border/60">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Raw OCR Text</h3>
              <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">{ocrResult}</pre>
            </Card>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
