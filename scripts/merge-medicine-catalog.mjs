#!/usr/bin/env node
/**
 * Merge a user-supplied medicine CSV (e.g. a distributor price list or a
 * Tamil Nadu pharmacy stock list) into the bundled medicine catalog.
 *
 * The catalog (public/medicineCatalog.jsonl) is a compact JSONL with rows:
 *   { n: name, c: company, s: composition, p: pack, f: form, u: unit,
 *     r: price, g: gstRate }
 * and is deduplicated by normalized `name|company`.
 *
 * The merge is additive and idempotent: rows already present in the catalog
 * (same normalized name+company) are skipped, so running the tool twice never
 * duplicates entries. The original catalog is backed up to
 * medicineCatalog.jsonl.bak before writing.
 *
 * Usage:
 *   node scripts/merge-medicine-catalog.mjs <input.csv> [output.jsonl]
 *
 *   input.csv    — your medicine list. Column headers are matched flexibly
 *                  (name / medicine / drug / item, company / manufacturer /
 *                  maker, composition / salt / ingredients, price / mrp /
 *                  rate, gst / gst rate / tax, pack / pack size, form /
 *                  dosage form, unit). If the first row has no recognizable
 *                  headers, the upstream dataset's positional layout is used:
 *                  1=name 2=price 3=discontinued 4=type 5=company 6=pack
 *                  7=composition1 8=composition2.
 *   output.jsonl — default public/medicineCatalog.jsonl (the file the app
 *                  actually serves). Pass a different path to write elsewhere
 *                  without touching the app's catalog.
 *
 * Examples:
 *   node scripts/merge-medicine-catalog.mjs my-stock.csv
 *   node scripts/merge-medicine-catalog.mjs my-stock.csv /tmp/merged.jsonl
 */
import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = resolve(ROOT, "public/medicineCatalog.jsonl");

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg) {
  console.error(
    "Usage: node scripts/merge-medicine-catalog.mjs <input.csv> [output.jsonl]",
  );
  process.exit(1);
}
const INPUT = resolve(inputArg);
const OUTPUT = resolve(outputArg || CATALOG);

if (!existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  process.exit(1);
}
if (!existsSync(CATALOG)) {
  console.error(`Catalog not found at ${CATALOG}. Run this from the project root.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* CSV parsing (handles quoted fields, escaped quotes, CRLF)           */
/* ------------------------------------------------------------------ */
function parseCSVLine(line) {
  const fields = [];
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

const clean = (s) =>
  String(s ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* Derivation helpers (mirror scripts/transform-medicine-data.ts)      */
/* ------------------------------------------------------------------ */
const FORM_RE =
  /\b(tablets?|tabs?|syrups?|capsules?|caps?|injections?|inj\.?|ointments?|creams?|drops|drop|inhalers?|sprays?|gels?|solutions?|suspensions?|powders?|lotions?|sachets?|ampoules?|ampules?|vials?|gargles?|lozenges?|granules?|suppositories?|emulsions?|shampoos?|soaps?|respules|patches?|kits?|sticks?|roll-?ons?|mouth\s?washes?|oral\s?gels?)$/i;

function deriveForm(name, pack) {
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

function deriveUnit(pack) {
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

function deriveGst(name, composition) {
  return /vitamin|mineral|supplement|protein/i.test(name + " " + composition)
    ? 12
    : 5;
}

const normKey = (name, company) =>
  (name + "|" + company).toLowerCase().replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */
const HEADER_ALIASES = {
  name: ["name", "medicine", "medicine name", "drug", "drug name", "product", "item", "brand"],
  company: ["company", "manufacturer", "maker", "mfr", "manufactured by", "pharma company"],
  composition: ["composition", "salt", "ingredients", "comp", "composition1", "active ingredients"],
  pack: ["pack", "pack size", "presentation", "package", "packaging", "packsize"],
  form: ["form", "dosage form", "category", "type"],
  unit: ["unit", "uom"],
  price: ["price", "mrp", "rate", "selling price", "cost", "price (rs)"],
  gst: ["gst", "gst rate", "gst%", "gst %", "tax", "tax rate", "gst_rate"],
};

function detectHeader(firstRow) {
  const lower = firstRow.map((c) => clean(c).toLowerCase());
  const map = {};
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

/* ------------------------------------------------------------------ */
/* Load the existing catalog's dedup keys                              */
/* ------------------------------------------------------------------ */
async function loadCatalogKeys() {
  const keys = new Set();
  const rl = createInterface({
    input: createReadStream(CATALOG, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t);
      if (row.n && row.c) keys.add(normKey(row.n, row.c));
    } catch {
      /* skip malformed line */
    }
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
const existingKeys = await loadCatalogKeys();
console.error(`Existing catalog: ${existingKeys.size} unique medicines`);

const inputLines = createInterface({
  input: createReadStream(INPUT, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

// Backup the app catalog before modifying it, so the merge is reversible.
if (OUTPUT === CATALOG) {
  const bak = CATALOG + ".bak";
  if (existsSync(bak)) renameSync(bak, bak + ".old");
  renameSync(CATALOG, bak);
  // Seed the merged output with the full existing catalog (will be overwritten
  // by the final write below — this also guards against a mid-run crash
  // leaving the app's catalog missing).
  writeFileSync(OUTPUT, readFileSync(bak, "utf8"));
}

const out = createWriteStream(OUTPUT, { flags: "a" });
const appendRow = (row) => out.write(JSON.stringify(row) + "\n");

let headerMap = null;
let first = true;
let readRows = 0;
let added = 0;
let skippedDup = 0;
let skippedInvalid = 0;
let noComposition = 0;

for await (const line of inputLines) {
  const fields = parseCSVLine(line);
  if (fields.every((f) => !clean(f))) continue;

  if (first) {
    headerMap = detectHeader(fields);
    if (headerMap) {
      first = false;
      continue;
    }
    // No recognizable headers → treat as upstream positional layout.
    headerMap = {};
    first = false;
  }

  readRows++;

  const get = (field) => {
    if (headerMap[field] === undefined) return "";
    return clean(fields[headerMap[field]]);
  };

  let name, company, composition, pack, price, gstRate, form, unit;

  if (Object.keys(headerMap).length === 0) {
    // Positional: 1=name 2=price 5=company 6=pack 7=comp1 8=comp2
    name = clean(fields[0]);
    price = parseFloat(fields[1]) || 0;
    company = clean(fields[4]).replace(/,$/, "");
    pack = clean(fields[5]);
    const comps = [clean(fields[6]), clean(fields[7])].filter(Boolean);
    composition = comps.join(" + ");
    form = deriveForm(name, pack);
    unit = deriveUnit(pack);
    gstRate = deriveGst(name, composition);
  } else {
    name = get("name");
    company = get("company");
    composition = get("composition");
    pack = get("pack");
    price = parseFloat(get("price")) || 0;
    const gstRaw = get("gst");
    gstRate = gstRaw ? (parseFloat(gstRaw) || 5) : deriveGst(name, composition);
    form = get("form") || deriveForm(name, pack);
    unit = get("unit") || deriveUnit(pack);
  }

  // Normalize company suffix the same way the transform script does.
  company = company
    .replace(/\s+(Ltd|Limited|Pvt|Private|Llp|LLP|Inc|Corp|Corporation)(\.)?$/i, "")
    .trim();

  if (!name || !company) {
    skippedInvalid++;
    continue;
  }

  const key = normKey(name, company);
  if (existingKeys.has(key)) {
    skippedDup++;
    continue;
  }
  existingKeys.add(key);

  if (!composition) noComposition++;

  appendRow({
    n: name,
    c: company,
    s: composition,
    p: pack,
    f: form,
    u: unit,
    r: Math.round(price * 100) / 100,
    g: gstRate,
  });
  added++;
}

out.end();

await new Promise((resolvePromise) => out.on("finish", resolvePromise));

console.error(
  `CSV rows: ${readRows} | added: ${added} | already in catalog: ${skippedDup} | skipped (missing name/company): ${skippedInvalid} | missing composition: ${noComposition}`,
);
console.error(`Merged catalog written: ${OUTPUT}`);

/* ------------------------------------------------------------------ */
/* Post-merge validation: every merged row must parse and have all      */
/* required fields, or the merge is treated as failed.                  */
/* ------------------------------------------------------------------ */
const validator = resolve(ROOT, "scripts/validate-medicine-catalog.mjs");
const check = spawnSync(process.execPath, [validator, OUTPUT], {
  encoding: "utf8",
});
process.stderr.write(check.stderr || "");
if (check.status !== 0) {
  console.error(
    `✗ MERGE REJECTED — validation failed on ${OUTPUT}.`,
    OUTPUT === CATALOG
      ? `The broken output was written, but the pre-merge catalog is untouched at ${CATALOG}.bak — restore it with:\n  mv ${CATALOG}.bak ${CATALOG}`
      : `The merged file at ${OUTPUT} is broken and should not be used.`,
  );
  process.exit(1);
}
console.error(
  `✓ Merged catalog validated: ${OUTPUT}`,
  `\nNext: npm run build && npm run dev  (the app serves the updated catalog from public/medicineCatalog.jsonl)`,
);
