import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Loader2,
  ScanLine,
  Upload,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

// We'll use Tesseract.js for OCR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Tesseract: any = null;

export default function ScanBillPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const createPurchaseBill = useMutation(api.purchaseBills.create);
  const [scanning, setScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [extractedData, setExtractedData] = useState<{
    supplierName?: string;
    billNo?: string;
    amount?: number;
    gstAmount?: number;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Show preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      setScanning(true);
      setOcrResult("");

      try {
        // Dynamically import Tesseract.js
        Tesseract = await import("tesseract.js");

        const {
          data: { text },
        } = await Tesseract.recognize(file, "eng", {
          logger: (m: any) => {
            if (m.status === "recognizing text") {
              // Could show progress
            }
          },
        });

        setOcrResult(text);

        // Attempt to extract structured data from OCR text
        const extracted = extractBillData(text);
        setExtractedData(extracted);

        // Create purchase bill record
        await createPurchaseBill({
          supplierName: extracted.supplierName || "Unknown Supplier",
          billNo: extracted.billNo || undefined,
          billDate: undefined,
          amount: extracted.amount || 0,
          gstAmount: extracted.gstAmount || undefined,
          ocrText: text,
          status: "pending",
        });

        toast("Bill scanned successfully");
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

  const extractBillData = (
    text: string,
  ): {
    supplierName?: string;
    billNo?: string;
    amount?: number;
    gstAmount?: number;
  } => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const result: {
      supplierName?: string;
      billNo?: string;
      amount?: number;
      gstAmount?: number;
    } = {};

    // Try to find supplier name (usually first few lines)
    if (lines.length > 0) {
      result.supplierName = lines[0];
    }

    // Try to find bill/invoice number
    const billNoMatch = text.match(
      /(?:bill|invoice|inv|receipt)\s*(?:no|#|:)?\s*[:\s]*([A-Za-z0-9/_-]+)/i,
    );
    if (billNoMatch) {
      result.billNo = billNoMatch[1];
    }

    // Try to find total amount
    const totalMatch = text.match(
      /(?:total|grand total|amount|net)\s*(?:amount|payable|due)?\s*[:₹Rs.\s]*([0-9,]+\.?\d*)/i,
    );
    if (totalMatch) {
      result.amount = parseFloat(totalMatch[1].replace(/,/g, ""));
    }

    // Try to find GST amount
    const gstMatch = text.match(
      /(?:gst|tax|gst amount)\s*[:₹Rs.\s]*([0-9,]+\.?\d*)/i,
    );
    if (gstMatch) {
      result.gstAmount = parseFloat(gstMatch[1].replace(/,/g, ""));
    }

    return result;
  };

  const handleUseCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      // Create a video element and capture a frame
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");

      // Stop the stream
      stream.getTracks().forEach((t) => t.stop());

      // Convert data URL to file
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "bill.jpg", { type: "image/jpeg" });

      // Process it
      if (fileInputRef.current) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInputRef.current.files = dt.files;
        const event = new Event("change", { bubbles: true });
        fileInputRef.current.dispatchEvent(event);
      }
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
          Upload or take a photo of a purchase bill to extract data via OCR
        </p>
      </div>

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
            <div className="w-full max-w-md border-2 border-dashed border-border rounded-sm p-12 text-center">
              <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                Upload a bill image or use your camera
              </p>
              <p className="text-xs text-muted-foreground/60">
                Supports JPG, PNG — Max 10MB
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
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
          </div>
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
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">
                  Bill recorded as pending. Process it in purchase bills.
                </span>
              </div>
            </Card>
          )}

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
