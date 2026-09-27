/**
 * Parses a user-supplied medicine CSV (e.g. a distributor price list or a
 * Tamil Nadu pharmacy stock list) into normalized catalog additions, mirroring
 * scripts/transform-medicine-data.ts so the app and the CLI stay consistent.
 *
 * Output rows map to CatalogAdditionInput and are deduplicated by normalized
 * `name|company`. Column headers are matched flexibly; if the first row has no
 * recognizable headers, the upstream dataset's positional layout is used
 * (1=name 2=price 5=company 6=pack 7=comp1 8=comp2).
 */
import type { CatalogAdditionInput } from "@/lib/api";

export interface ParsedMedicineCsv {
  /** Valid, non-duplicate rows ready to persist. */
  additions: CatalogAdditionInput[];
  rows: number;
  duplicates: number;
  invalid: number;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

const clean = (s: unknown) =>
  String(s ?? "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();

const FORM_RE =
  /\b(tablets?|tabs?|syrups?|capsules?|caps?|injections?|inj\.?|ointments?|creams?|drops|drop|inhalers?|sprays?|gels?|solutions?|suspensions?|powders?|lotions?|sachets?|ampoules?|ampules?|vials?|gargles?|lozenges?|granules?|suppositories?|emulsions?|shampoos?|soaps?|respules|patches?|kits?|sticks?|roll-?ons?|mouth\s?washes?|oral\s?gels?)$/i;

function deriveForm(name: string, pack: string): string {
  const m = name.match(FORM_RE);
  if (m) {
    const w = m[1];
    return w.charAt(0).toUpperCase() + w.slice(1).replace(/\.$/, "");
  }
  const p = pack.toLowerCase();
  if (/injection|vial|ampoule|ampule/.test(p)) return "Injection";
  if (/ointment|cream/.test(p)) return "Ointment";
  if (/drops/.test(p)) return "Drops";
  if (/syrup/.test(p)) return "Syrup";
  if (/spray/.test(p)) return "Spray";
  if (/gel/.test(p)) return "Gel";
  if (/lotion/.test(p)) return "Lotion";
  if (/powder/.test(p)) return "Powder";
  return "Other";
}

function deriveUnit(pack: string): string {
  const p = pack.toLowerCase();
  if (/strip/.test(p)) return "Strip";
  if (/bottle/.test(p)) return "Bottle";
  if (/vial/.test(p)) return "Vial";
  if (/ampoule|ampule/.test(p)) return "Ampoule";
  if (/tube/.test(p)) return "Tube";
  if (/sachet/.test(p)) return "Sachet";
  if (/canister/.test(p)) return "Canister";
  if (/spray/.test(p)) return "Spray";
  if (/box|pack of/.test(p)) return "Box";
  return "Nos";
}

const GST_BY_TEXT: Record<string, number> = {
  "0": 0,
  "5": 5,
  "12": 12,
  "18": 18,
  "28": 28,
};

export const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "medicine", "medicine name", "drug", "drug name", "product", "item", "brand"],
  company: ["company", "manufacturer", "maker", "mfr", "manufactured by", "pharma company"],
  composition: ["composition", "salt", "ingredients", "comp", "composition1", "active ingredients"],
  pack: ["pack", "pack size", "presentation", "package", "packaging", "packsize"],
  form: ["form", "dosage form", "category", "type"],
  unit: ["unit", "uom"],
  price: ["price", "mrp", "rate", "selling price", "cost", "price (rs)"],
  gst: ["gst", "gst rate", "gst%", "gst %", "tax", "tax rate", "gst_rate"],
};

function detectHeader(firstRow: string[]): Record<string, number> | null {
  const lower = firstRow.map((c) => clean(c).toLowerCase());
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      const idx = lower.indexOf(a);
      if (idx !== -1) {
        map[field] = idx;
        break;
      }
    }
  }
  return Object.keys(map).length >= 2 ? map : null;
}

function normalizeCompany(company: string): string {
  return company
    .replace(/\s+(Ltd|Limited|Pvt|Private|Llp|LLP|Inc|Corp|Corporation)(\.)?$/i, "")
    .trim();
}

const normKey = (name: string, company: string) =>
  (name + "|" + company).toLowerCase().replace(/\s+/g, " ").trim();

export function parseMedicineCsv(text: string): ParsedMedicineCsv {
  const lines = text.split(/\r?\n/);
  let headerMap: Record<string, number> | null = null;
  let first = true;
  const seen = new Set<string>();
  const additions: CatalogAdditionInput[] = [];
  let rows = 0;
  let invalid = 0;

  for (let rawIdx = 0; rawIdx < lines.length; rawIdx++) {
    const fields = parseCSVLine(lines[rawIdx]);
    if (fields.every((f) => !clean(f))) continue;

    if (first) {
      headerMap = detectHeader(fields);
      first = false;
      if (headerMap) continue;
      // No recognizable header → positional layout.
      headerMap = {};
    }
    rows++;

    let name = "";
    let company = "";
    let composition = "";
    let pack = "";
    let form = "";
    let unit = "";
    let price = 0;
    let gstRaw = "";

    if (Object.keys(headerMap ?? {}).length === 0) {
      name = clean(fields[0]);
      price = parseFloat(fields[1]) || 0;
      company = normalizeCompany(clean(fields[4]).replace(/,$/, ""));
      pack = clean(fields[5]);
      const comps = [clean(fields[6]), clean(fields[7])].filter(Boolean);
      composition = comps.join(" + ");
      form = getForm(fields[0], pack);
      unit = deriveUnit(pack);
    } else {
      const get = (field: string) =>
        headerMap![field] === undefined ? "" : clean(fields[headerMap![field]]);
      name = get("name");
      company = normalizeCompany(get("company"));
      composition = get("composition");
      pack = get("pack");
      price = parseFloat(get("price")) || 0;
      gstRaw = get("gst");
      form = get("form") || getForm(name, pack);
      unit = get("unit") || deriveUnit(pack);
    }

    if (!name || !company) {
      invalid++;
      continue;
    }

    const key = normKey(name, company);
    if (seen.has(key)) {
      invalid++;
      continue;
    }
    seen.add(key);

    // Infer GST the same way the transform script does when not supplied.
    let gstRate: number;
    if (gstRaw) {
      gstRate = GST_BY_TEXT[clean(gstRaw)] ?? (parseFloat(gstRaw) || 5);
    } else {
      gstRate = /vitamin|mineral|supplement|protein/i.test(name + " " + composition)
        ? 12
        : 5;
    }

    additions.push({
      catalogKey: key,
      name,
      company,
      composition,
      form,
      unit,
      packSize: pack,
      price: Math.round(price * 100) / 100,
      gstRate,
    });
  }

  return { additions, rows, duplicates: rows - additions.length - invalid, invalid };
}

function getForm(name: string, pack: string): string {
  const m = name.match(FORM_RE);
  if (m) {
    const w = m[1];
    return w.charAt(0).toUpperCase() + w.slice(1).replace(/\.$/, "");
  }
  const p = pack.toLowerCase();
  if (/injection|vial|ampoule|ampule/.test(p)) return "Injection";
  if (/ointment|cream/.test(p)) return "Ointment";
  if (/drops/.test(p)) return "Drops";
  if (/syrup/.test(p)) return "Syrup";
  if (/spray/.test(p)) return "Spray";
  if (/gel/.test(p)) return "Gel";
  if (/lotion/.test(p)) return "Lotion";
  if (/powder/.test(p)) return "Powder";
  return "Other";
}

export function parseGst(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 5;
  if (typeof v === "number") return GST_BY_TEXT[String(v)] ?? v;
  return GST_BY_TEXT[clean(v)] ?? (parseFloat(v) || 5);
}