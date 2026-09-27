/**
 * Transforms the Indian Medicine Dataset CSV (junioralive/Indian-Medicine-Dataset,
 * MIT licensed) into a compact JSONL asset for the app.
 *
 * Usage: bun scripts/transform-medicine-data.ts <input.csv> <output.jsonl>
 *
 * Output row keys: n=name, c=company, s=composition, p=pack, f=form, u=unit,
 * r=price, g=gstRate. hsnCode is a constant default (30049099) applied at
 * read time in the hook.
 *
 * Streams the input line-by-line (dataset contains no multi-line quoted
 * fields) and appends output in batches to keep memory usage low.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

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

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

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

const [input, output] = process.argv.slice(2);
const rl = createInterface({
  input: createReadStream(input),
  crlfDelay: Infinity,
});

const seen = new Set<string>();
let total = 0;
let kept = 0;
let dropped = 0;
let noComposition = 0;
let first = true;
let buf: string[] = [];

const flush = () => {
  if (buf.length === 0) return;
  writeFileSync(output, buf.join("\n") + "\n", { flag: first ? "w" : "a" });
  first = false;
  buf = [];
};

for await (const line of rl) {
  total++;
  if (total === 1) continue; // header
  const r = parseCSVLine(line);
  if (r.length < 8) {
    dropped++;
    continue;
  }
  const type = clean(r[5]);
  if (type !== "allopathy") {
    dropped++;
    continue;
  }
  if (clean(r[3]).toUpperCase() !== "FALSE") {
    dropped++;
    continue;
  }
  const name = clean(r[1]);
  if (!name) {
    dropped++;
    continue;
  }
  const price = parseFloat(r[2]) || 0;
  let company = clean(r[4]).replace(/,$/, "");
  company = company
    .replace(
      /\s+(Ltd|Limited|Pvt|Private|Llp|LLP|Inc|Corp|Corporation)(\.)?$/i,
      "",
    )
    .trim();
  const pack = clean(r[6]);
  const comps = [clean(r[7]), clean(r[8])].filter(Boolean);
  const composition = comps.join(" + ");
  if (!composition) noComposition++;

  const key = name.toLowerCase() + "|" + company.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const form = deriveForm(name, pack);
  const unit = deriveUnit(pack);
  const gstRate = /vitamin|mineral|supplement|protein/i.test(
    name + " " + composition,
  )
    ? 12
    : 5;

  buf.push(
    JSON.stringify({
      n: name,
      c: company,
      s: composition,
      p: pack,
      f: form,
      u: unit,
      r: Math.round(price * 100) / 100,
      g: gstRate,
    }),
  );
  kept++;
  if (buf.length >= 5000) flush();
}
flush();

console.error(
  "total rows:",
  total,
  "| kept:",
  kept,
  "| dropped:",
  dropped,
  "| no composition:",
  noComposition,
);
console.error("written:", output);
