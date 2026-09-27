#!/usr/bin/env node
/**
 * Validate the medicine catalog JSONL (public/medicineCatalog.jsonl or any
 * file passed as an argument). Every line must:
 *
 *   - parse as JSON
 *   - have non-empty string fields: n (name), c (company), s (composition)
 *   - have string fields: p (pack), f (form), u (unit)
 *   - have a finite non-negative number r (price)
 *   - have a number g (gstRate) in {0, 5, 12, 18, 28}
 *   - be unique by normalized `name|company` (the app's catalogKey identity)
 *
 * Findings are reported per line. Errors exit non-zero (merge should refuse to
 * ship a broken catalog); warnings exit zero (reported but not blocking).
 *
 * Usage:
 *   node scripts/validate-medicine-catalog.mjs [file.jsonl]
 *
 * Example:
 *   node scripts/validate-medicine-catalog.mjs public/medicineCatalog.jsonl
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILE = resolve(ROOT, "public/medicineCatalog.jsonl");
const FILE = resolve(process.argv[2] || DEFAULT_FILE);

if (!existsSync(FILE)) {
  console.error(`File not found: ${FILE}`);
  process.exit(2);
}

const ALLOWED_GST = new Set([0, 5, 12, 18, 28]);

function describe(row) {
  return (row && row.n ? String(row.n) : "<no name>").slice(0, 60);
}

const errors = [];
const warnings = [];
const seen = new Map(); // normalized name|company -> first line number

let lineNo = 0;
let rows = 0;

const rl = createInterface({
  input: createReadStream(FILE, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const rawLine of rl) {
  lineNo++;
  const line = rawLine.trim();
  if (!line) continue;

  let row;
  try {
    row = JSON.parse(line);
  } catch (err) {
    errors.push(`line ${lineNo}: not valid JSON (${err.message})`);
    continue;
  }
  rows++;

  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    errors.push(`line ${lineNo}: row is not a JSON object`);
    continue;
  }

  /* Required, non-empty string fields. */
  for (const [key, label] of [
    ["n", "name"],
    ["c", "company"],
    ["s", "composition"],
  ]) {
    if (typeof row[key] !== "string" || !row[key].trim()) {
      errors.push(
        `line ${lineNo}: missing required field "${key}" (${label}) — ${describe(row)}`,
      );
    }
  }

  /* Optional-but-expected string fields. */
  for (const [key, label] of [
    ["p", "pack"],
    ["f", "form"],
    ["u", "unit"],
  ]) {
    if (row[key] !== undefined && row[key] !== null && typeof row[key] !== "string") {
      errors.push(
        `line ${lineNo}: field "${key}" (${label}) must be a string, got ${typeof row[key]} — ${describe(row)}`,
      );
    } else if (typeof row[key] === "string" && !row[key].trim()) {
      warnings.push(
        `line ${lineNo}: field "${key}" (${label}) is empty — ${describe(row)}`,
      );
    }
  }

  /* Price. */
  if (typeof row.r !== "number" || !Number.isFinite(row.r) || row.r < 0) {
    errors.push(
      `line ${lineNo}: field "r" (price) must be a finite number >= 0, got ${JSON.stringify(row.r)} — ${describe(row)}`,
    );
  }

  /* GST rate. */
  if (typeof row.g !== "number" || !Number.isFinite(row.g)) {
    errors.push(
      `line ${lineNo}: field "g" (gstRate) must be a number, got ${JSON.stringify(row.g)} — ${describe(row)}`,
    );
  } else if (!ALLOWED_GST.has(row.g)) {
    warnings.push(
      `line ${lineNo}: field "g" (gstRate) is ${row.g}, not in {0, 5, 12, 18, 28} — ${describe(row)}`,
    );
  }

  /* Duplicate identity. */
  if (typeof row.n === "string" && typeof row.c === "string") {
    const key =
      (row.n + "|" + row.c).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) {
      errors.push(
        `line ${lineNo}: duplicate name|company — first seen at line ${seen.get(key)} — ${describe(row)}`,
      );
    } else {
      seen.set(key, lineNo);
    }
  }
}

for (const e of errors) console.error(`  ✗ ${e}`);
for (const w of warnings) console.error(`  ⚠ ${w}`);

console.error(
  `\n${rows.toLocaleString()} rows checked in ${FILE}`,
);
if (errors.length > 0) {
  console.error(
    `✗ FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`,
  );
  process.exit(1);
}
if (warnings.length > 0) {
  console.error(
    `✓ PASSED with ${warnings.length} warning(s)`,
  );
  process.exit(0);
}
console.error("✓ PASSED — catalog is well-formed");
process.exit(0);
