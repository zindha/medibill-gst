/**
 * OCR parsing helpers for purchase bills.
 *
 * `extractBillData` pulls header fields (supplier, bill no, amount, GST)
 * from raw OCR text. `parseOcrLineItems` heuristically splits item lines
 * into name / quantity / rate / GST entries — the output is a *preview*
 * that users review and correct before importing into inventory.
 */

export interface ExtractedBillData {
  supplierName?: string;
  billNo?: string;
  amount?: number;
  gstAmount?: number;
}

export interface ParsedBillItem {
  name: string;
  quantity: number;
  rate: number;
  gstRate: number;
  hsnCode?: string;
}

const VALID_GST = [0, 5, 12, 18, 28] as const;

const sanitizeGst = (rate: number | undefined): number =>
  VALID_GST.includes((rate ?? 5) as (typeof VALID_GST)[number])
    ? (rate as number)
    : 5;

export function extractBillData(text: string): ExtractedBillData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const result: ExtractedBillData = {};

  // Try to find supplier name (usually first few lines)
  if (lines.length > 0) {
    result.supplierName = lines[0];
  }

  // Try to find bill/invoice number
  const billNoMatch = text.match(
    /(?:bill|invoice|inv|receipt)\s*(?:no|#|:)?\s*[:\\s]*([A-Za-z0-9/_-]+)/i,
  );
  if (billNoMatch) {
    result.billNo = billNoMatch[1];
  }

  // Try to find total amount
  const totalMatch = text.match(
    /(?:total|grand total|amount|net)\s*(?:amount|payable|due)?\s*[:₹Rs.\\s]*([0-9,]+\\.?\\d*)/i,
  );
  if (totalMatch) {
    result.amount = parseFloat(totalMatch[1].replace(/,/g, ""));
  }

  // Try to find GST amount
  const gstMatch = text.match(
    /(?:gst|tax|gst amount)\s*[:₹Rs.\\s]*([0-9,]+\\.?\\d*)/i,
  );
  if (gstMatch) {
    result.gstAmount = parseFloat(gstMatch[1].replace(/,/g, ""));
  }

  return result;
}

// Lines that are bill headers/footers rather than line items
const SKIP_RE =
  /\b(total|subtotal|grand total|gst|cgst|sgst|igst|discount|amount|payable|round|off|balance|change|paid|return|thanks|thank you|visit again|welcome|cash|upi|card|cheque|net|mrp|bill no|invoice|date|phone|ph:|gstin|tin|address|regd|cst|vat|batch|exp|mfg|rate|qty|items?|goods|drugs|expiry|manufactur|packing|hsn|sac|kg|ml)\b/i;

const NUMBER_RE = /(\d+(?:\.\d+)?)/g;
const GST_PCT_RE = /(\d{1,2})\s*%/;

export function parseOcrLineItems(text: string): ParsedBillItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t/g, "  ").trim())
    .filter(Boolean);

  const merged = new Map<string, ParsedBillItem>();
  const order: string[] = [];

  for (const rawLine of lines) {
    if (SKIP_RE.test(rawLine)) continue;

    const numbers = [...rawLine.matchAll(NUMBER_RE)].map((m) =>
      parseFloat(m[1]),
    );
    if (numbers.length === 0) continue;

    // Medicine name = the line with digits/currency/symbols stripped
    const name = rawLine
      .replace(NUMBER_RE, " ")
      .replace(/[₹Rs.,x×*/@%:;|_—–-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 2) continue;

    let quantity: number;
    let rate: number;
    if (numbers.length >= 3) {
      // Typical format: <name> <qty> <rate> <amount>
      quantity = numbers[numbers.length - 3];
      rate = numbers[numbers.length - 2];
    } else if (numbers.length === 2) {
      quantity = numbers[0];
      rate = numbers[1];
    } else {
      quantity = 1;
      rate = numbers[0];
    }

    quantity = Math.max(1, Math.round(quantity));
    rate = Math.max(0, Math.min(rate, 1000000));
    if (quantity <= 0) continue;

    const gstMatch = rawLine.match(GST_PCT_RE);
    const gstRate = sanitizeGst(gstMatch ? parseFloat(gstMatch[1]) : 5);

    const key = name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      merged.set(key, { name, quantity, rate, gstRate });
      order.push(key);
    }
  }

  // Cap the preview at 50 rows so OCR noise can't flood the screen
  return order.slice(0, 50).map((k) => merged.get(k)!);
}
