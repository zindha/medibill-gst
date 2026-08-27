import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Loader2,
  PackagePlus,
  ScanLine,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  extractBillData,
  parseOcrLineItems,
  type ParsedBillItem,
} from "@/utils/billOcr";

const GST_RATES = [0, 5, 12, 18, 28];

export default function ScanBillPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const createPurchaseBill = useMutation(api.purchaseBills.create);
  const importLineItems = useMutation(api.purchaseBills.importLineItems);
  const medicines = useQuery(api.medicines.list, {});
  const [scanning, setScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [extractedData, setExtractedData] = useState<{
    supplierName?: string;
    billNo?: string;
    amount?: number;
    gstAmount?: number;
  }>({});
  const [lineItems, setLineItems] = useState<ParsedBillItem[]>([]);
  const [billId, setBillId] = useState<Id<"purchaseBills"> | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(
    async (file: File) => {
      // Show preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      setScanning(true);
      setOcrResult("");
      setImported(false);
      setImportSummary("");

      try {
        // Dynamically import Tesseract.js
        const Tesseract = await import("tesseract.js");

        const {
          data: { text },
        } = await Tesseract.recognize(file, "eng");

        setOcrResult(text);

        // Extract header fields + line items
        const extracted = extractBillData(text);
        const items = parseOcrLineItems(text);
        setExtractedData(extracted);
        setLineItems(items);

        // Create purchase bill record (pending) and keep its id for import
        const id = await createPurchaseBill({
          supplierName: extracted.supplierName || "Unknown Supplier",
          billNo: extracted.billNo || undefined,
          billDate: new Date().toISOString().split("T")[0],
          amount: extracted.amount || 0,
          gstAmount: extracted.gstAmount || undefined,
          ocrText: text,
          status: "pending",
        });
        setBillId(id);

        toast(
          items.length > 0
            ? `Scanned ${items.length} line ${items.length === 1 ? "item" : "items"} — review before importing`
            : "Bill scanned — no line items detected. You can add items to inventory manually.",
        );
      } catch (error) {
        console.error("OCR error:", error);
        toast(
          "Failed to scan bill. The Tesseract engine may still be loading. Try again.",
        );
      } finally {
        setScanning(false);
      }
    },
    [createPurchaseBill],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processImage(file);
    },
    [processImage],
  );

  const updateLineItem = (
    index: number,
    field: keyof ParsedBillItem,
    value: string | number,
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (!billId) return;
    const valid = lineItems.filter((i) => i.name.trim() && i.quantity > 0);
    if (valid.length === 0) {
      toast("No valid line items to import");
      return;
    }
    setImporting(true);
    try {
      const { created, updated } = await importLineItems({
        billId,
        items: valid.map((i) => ({
          name: i.name.trim(),
          quantity: i.quantity,
          rate: i.rate,
          gstRate: i.gstRate,
          unit: undefined,
          category: undefined,
        })),
      });
      setImported(true);
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} new item${created === 1 ? "" : "s"} added`);
      if (updated > 0) parts.push(`${updated} existing item${updated === 1 ? "" : "s"} stock updated`);
      setImportSummary(
        parts.length > 0
          ? `${parts.join(" · ")} — GST/HSN from this bill saved on each item.`
          : "No changes made.",
      );
      toast("Bill items imported to inventory");
    } catch {
      toast("Failed to import items");
    } finally {
      setImporting(false);
    }
  };

  const handleUseCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");

      stream.getTracks().forEach((t) => t.stop());

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "bill.jpg", { type: "image/jpeg" });

      await processImage(file);
    } catch (error) {
      console.error("Camera error:", error);
      toast("Camera access denied or not available on this device");
    }
  };

  if (!isAuthenticated && !isLoading) {
    navigate("/auth");
    return null;
  }

  if (isLoading) {
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
      className="space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scan Bill</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload or take a photo of a purchase bill — review the extracted
          items, then import them into your inventory
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <Card className="p-6 border-border/60">
          <div className="flex flex-col items-center gap-4">
            {imagePreview ? (
              <div className="relative w-full max-w-md">
                <img
                  src={imagePreview}
                  alt="Bill preview"
                  className="w-full rounded-sm border border-border/60 object-contain max-h-80"
                />
                {scanning && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        Running OCR...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <motion.div
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="w-full max-w-md border-2 border-dashed border-border rounded-sm p-12 text-center transition-colors hover:border-foreground/40"
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                  className="inline-block"
                >
                  <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                </motion.div>
                <p className="text-sm text-muted-foreground mb-1">
                  Upload a bill image or use your camera
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Supports JPG, PNG — Max 10MB
                </p>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Image
              </Button>
              <Button onClick={handleUseCamera} disabled={scanning}>
                <Camera className="h-4 w-4 mr-2" />
                Use Camera
              </Button>
            </motion.div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </Card>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {[
          {
            n: "1",
            title: "Capture",
            desc: "Snap the supplier bill with your camera or upload a photo.",
          },
          {
            n: "2",
            title: "Review",
            desc: "OCR extracts items, quantities and rates — fix anything in the preview.",
          },
          {
            n: "3",
            title: "Import",
            desc: "Items land in inventory with the bill's GST, and the bill is marked processed.",
          },
        ].map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 + i * 0.07, duration: 0.3 }}
            className="flex items-start gap-3 border border-border/60 rounded-sm p-4"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {s.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* OCR Results */}
      {ocrResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {extractedData.amount && (
            <Card className="p-5 border-border/60">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Extracted Data
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {extractedData.supplierName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p className="text-sm font-medium">
                      {extractedData.supplierName}
                    </p>
                  </div>
                )}
                {extractedData.billNo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Bill No.</p>
                    <p className="text-sm font-medium">
                      {extractedData.billNo}
                    </p>
                  </div>
                )}
                {extractedData.amount && (
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-medium">
                      ₹{extractedData.amount.toFixed(2)}
                    </p>
                  </div>
                )}
                {extractedData.gstAmount && (
                  <div>
                    <p className="text-xs text-muted-foreground">GST Amount</p>
                    <p className="text-sm font-medium">
                      ₹{extractedData.gstAmount.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <CheckCircle2
                  className={`h-4 w-4 ${imported ? "text-green-600" : "text-amber-600"}`}
                />
                <span className="text-xs text-muted-foreground">
                  {imported
                    ? "Bill processed — items imported to inventory."
                    : "Bill recorded as pending. Review the items below and import to inventory."}
                </span>
              </div>
            </Card>
          )}

          {/* Line item review */}
          {lineItems.length > 0 && (
            <Card className="p-5 border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                  Items to Import
                </h3>
                <span className="text-xs text-muted-foreground">
                  {lineItems.length} line{" "}
                  {lineItems.length === 1 ? "item" : "items"} — review before
                  importing
                </span>
              </div>

              {/* Header (desktop) */}
              <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 mb-1">
                <div className="col-span-5">Item</div>
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-1 text-center">GST%</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-1.5">
                {lineItems.map((item, i) => {
                  const exists = medicines?.some(
                    (m) => m.name.toLowerCase() === item.name.toLowerCase(),
                  );
                  const amount = item.quantity * item.rate;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-sm border border-border/40"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <Input
                          value={item.name}
                          onChange={(e) =>
                            updateLineItem(i, "name", e.target.value)
                          }
                          placeholder="Medicine name"
                          className="h-8 text-sm"
                        />
                        <span
                          className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-sm border ${
                            exists
                              ? "border-green-600/30 text-green-700 bg-green-600/5"
                              : "border-sky-600/30 text-sky-700 bg-sky-600/5"
                          }`}
                        >
                          {exists
                            ? "In stock — qty will be added"
                            : "New item"}
                        </span>
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              i,
                              "quantity",
                              Math.max(1, Number(e.target.value)),
                            )
                          }
                          className="h-8 text-sm text-center"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.rate}
                          onChange={(e) =>
                            updateLineItem(i, "rate", Number(e.target.value))
                          }
                          className="h-8 text-sm text-right"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <Select
                          value={String(item.gstRate)}
                          onValueChange={(v) =>
                            updateLineItem(i, "gstRate", Number(v))
                          }
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GST_RATES.map((r) => (
                              <SelectItem key={r} value={String(r)}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 sm:col-span-2 text-right text-sm font-medium">
                        ₹{amount.toFixed(2)}
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLineItem(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Line total:{" "}
                  <span className="font-medium text-foreground">
                    ₹
                    {lineItems
                      .reduce((s, i) => s + i.quantity * i.rate, 0)
                      .toFixed(2)}
                  </span>
                  {extractedData.amount
                    ? ` · Bill total: ₹${extractedData.amount.toFixed(2)}`
                    : ""}
                </p>
                <div className="flex items-center gap-2">
                  {importSummary && (
                    <p className="text-xs text-green-700">{importSummary}</p>
                  )}
                  <Button
                    onClick={handleImport}
                    disabled={
                      importing ||
                      imported ||
                      !billId ||
                      lineItems.length === 0
                    }
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {importing
                      ? "Importing..."
                      : imported
                        ? "Imported ✓"
                        : "Import to Inventory"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Raw OCR Text */}
          <Card className="p-5 border-border/60">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              Raw OCR Text
            </h3>
            <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
              {ocrResult}
            </pre>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
