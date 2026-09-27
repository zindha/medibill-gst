// Validate: move the 243k-row catalog into SQLite and search server-side.
const D = require("better-sqlite3");
const fs = require("fs");
const SOURCE = "D:/Projects/MediBillGST/public/medicineCatalog.jsonl";
const TESTDB = "D:/Projects/MediBillGST/scripts/_catalog-bench.db";

fs.rmSync(TESTDB, { force: true });
const db = new D(TESTDB);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE catalog (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    composition TEXT NOT NULL,
    pack TEXT, form TEXT, unit TEXT,
    price REAL, gst INTEGER,
    lname TEXT NOT NULL
  );
`);

// ---- import timing ----
const t0 = Date.now();
const text = fs.readFileSync(SOURCE, "utf8");
const lines = text.split("\n").filter((l) => l.trim().length > 0);
const rows = lines.map((l) => JSON.parse(l));
const t1 = Date.now();
console.log(`read + parse 243k rows : ${t1 - t0} ms`);

const ins = db.prepare(
  "INSERT INTO catalog (name,company,composition,pack,form,unit,price,gst,lname) VALUES (?,?,?,?,?,?,?,?,?)"
);
const many = db.transaction((items) => {
  for (const r of items) ins.run(r.n, r.c, r.s, r.p, r.f, r.u, r.r, r.g, r.n.toLowerCase());
});
many(rows);
const t2 = Date.now();
console.log(`insert 243k rows       : ${t2 - t1} ms`);
console.log(`DB file size           : ${(fs.statSync(TESTDB).size / 1048576).toFixed(1)} MB`);

// ---- unchanged (no index) LIKE search ----
function searchLike(q, limit = 25) {
  return db
    .prepare(
      `SELECT name,company,composition,pack,form,unit,price,gst
       FROM catalog
       WHERE lname LIKE ? OR lower(company) LIKE ? OR lower(composition) LIKE ?
       LIMIT ?`
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`, limit);
}

console.log("\n--- LIKE '%q%' search (no index) ---");
for (const q of ["para", "dolo", "azith", "zzzznotfound", "xyzzy", "q", "augmentin"]) {
  const s = Date.now();
  const r = searchLike(q);
  console.log(`  ${q.padEnd(14)} ${String(Date.now() - s).padStart(4)} ms  (${r.length} hits)`);
}
console.log("\n--- required doc size on the wire: 25 rows ~", JSON.stringify(searchLike("para")[0]).length, "bytes/row ---");

// ---- FTS5 comparison ----
db.exec(`CREATE VIRTUAL TABLE fts USING fts5(name, company, composition, content='catalog', content_rowid='id');`);
const s0 = Date.now();
db.exec(`INSERT INTO fts(fts) VALUES('rebuild');`);
console.log(`\nFTS5 index build       : ${Date.now() - s0} ms`);

console.log("\n--- FTS5 prefix search ---");
for (const q of ["para*", "dolo*", "azith*", "zzzznotfound*", "q*", "augmentin*"]) {
  const s = Date.now();
  let r = [];
  try {
    r = db.prepare(`SELECT c.name FROM fts f JOIN catalog c ON c.id=f.rowid WHERE fts MATCH ? LIMIT 25`).all(q);
  } catch (e) { r = [{ name: "ERR " + e.message }]; }
  console.log(`  ${q.padEnd(14)} ${String(Date.now() - s).padStart(4)} ms  (${r.length} hits)`);
}

db.close();
