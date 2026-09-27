// Benchmark the exact code path used by useMedicineCatalog.ts
const fs = require("fs");
const path = "D:/Projects/MediBillGST/public/medicineCatalog.jsonl";

// --- Step 1: the load path (fetch text -> split -> JSON.parse each line) ---
const t0 = Date.now();
const text = fs.readFileSync(path, "utf8");
const t1 = Date.now();
const rows = text
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l));
const t2 = Date.now();

console.log(`bytes          : ${(text.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`rows           : ${rows.length}`);
console.log(`read+decode    : ${t1 - t0} ms`);
console.log(`split+parse    : ${t2 - t1} ms   <-- blocking main-thread work`);
console.log(`LOAD TOTAL     : ${t2 - t0} ms`);
console.log(`heapUsed       : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`);

// --- Step 2: the search path (exact loop from the useMemo) ---
function search(q, limit = 25) {
  const out = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (
      !(
        row.n.toLowerCase().includes(q) ||
        row.c.toLowerCase().includes(q) ||
        row.s.toLowerCase().includes(q)
      )
    ) {
      continue;
    }
    out.push(row);
  }
  return out;
}

console.log("\n--- search() timings (per keystroke, after load) ---");
for (const q of ["para", "dolo", "azith", "zzzznotfound", "xyzzy", "q"]) {
  const s = Date.now();
  const r = search(q);
  const ms = Date.now() - s;
  console.log(`  "${q}".padEnd() -> ${ms} ms   (${r.length} hits)`);
}

// --- Step 3: cold vs warm parse, repeated (simulates remount/refresh) ---
console.log("\n--- repeated full loads ---");
for (let i = 0; i < 3; i++) {
  const s = Date.now();
  const t = fs.readFileSync(path, "utf8");
  const rr = t.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  console.log(`  load #${i + 1}: ${Date.now() - s} ms (${rr.length} rows)`);
}
