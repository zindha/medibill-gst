// Compare FTS5 tokenizers for MEDICINE semantics.
// Pharmacists search by root/suffix: "cillin", "mycin", "prazole", "sartan".
const D = require("better-sqlite3");
const fs = require("fs");
const SOURCE = "D:/Projects/MediBillGST/public/medicineCatalog.jsonl";

const rows = fs
  .readFileSync(SOURCE, "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l));
console.log(`rows: ${rows.length}\n`);

function build(tokenizer) {
  const file = `D:/Projects/MediBillGST/scripts/_fts-${tokenizer}.db`;
  fs.rmSync(file, { force: true });
  const db = new D(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE catalog (id INTEGER PRIMARY KEY, name TEXT, company TEXT, composition TEXT);`);
  const ins = db.prepare("INSERT INTO catalog VALUES (?,?,?,?)");
  const tx = db.transaction((items) => {
    items.forEach((r, i) => ins.run(i + 1, r.n, r.c, r.s));
  });
  tx(rows);
  const spec = tokenizer === "none" ? "" : `, tokenize='${tokenizer}'`;
  db.exec(
    `CREATE VIRTUAL TABLE fts USING fts5(name, company, composition, content='catalog', content_rowid='id'${spec});`
  );
  const s = Date.now();
  db.exec(`INSERT INTO fts(fts) VALUES('rebuild');`);
  console.log(`[${tokenizer}] index build: ${Date.now() - s} ms   size: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
  return { db, file };
}

function run(db, label) {
  const queries = [
    ["para", "prefix, common"],
    ["cillin", "SUFFIX root (amoxycillin)"],
    ["mycin", "SUFFIX root (azithromycin)"],
    ["prazole", "SUFFIX root (omeprazole)"],
    ["sartan", "SUFFIX root (telmisartan)"],
    ["dolo 650", "multi-token"],
    ["zzzznotfound", "no match (worst case)"],
    ["am", "2-char"],
    ["q", "1-char"],
  ];
  console.log(`\n===== ${label} =====`);
  for (const [q, note] of queries) {
    const s = Date.now();
    let n = 0, err = "";
    try {
      const term = q.replace(/"/g, '""');
      const sql = `SELECT c.name FROM fts f JOIN catalog c ON c.id=f.rowid WHERE fts MATCH ? LIMIT 25`;
      n = db.prepare(sql).all(`"${term}"`).length;
    } catch (e) {
      err = "ERR: " + e.message;
    }
    console.log(`  ${q.padEnd(13)} ${String(Date.now() - s).padStart(5)} ms  hits=${String(n).padStart(2)}  ${err || note}`);
  }
  // verify a suffix query actually returns the right drug
  try {
    const hit = db.prepare(
      `SELECT c.name, c.composition FROM fts f JOIN catalog c ON c.id=f.rowid WHERE fts MATCH ? LIMIT 3`
    ).all('"cillin"');
    console.log("  'cillin' sample:", hit.map((h) => h.name).join(" | ") || "(none)");
  } catch (e) {
    console.log("  'cillin' sample: ERR", e.message);
  }
}

const prefix = build("unicode61");
run(prefix.db, "FTS5 unicode61 (prefix/token)");
prefix.db.close();

let tri;
try {
  tri = build("trigram");
  run(tri.db, "FTS5 trigram (true substring, indexed)");
  tri.db.close();
} catch (e) {
  console.log("\ntrigram unsupported:", e.message);
}
