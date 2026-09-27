// Which part of the search is slow for high-match queries?
const D = require("better-sqlite3");
const db = new D("C:/ProgramData/MediBill/data/catalog.db", { readonly: true });

function time(label, fn, runs = 5) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const s = process.hrtime.bigint();
    fn();
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    if (ms < best) best = ms;
  }
  console.log(`  ${label.padEnd(48)} ${best.toFixed(1).padStart(7)} ms`);
}

const MATCH = '"para"';
const q1 = db.prepare(`SELECT COUNT(*) AS c FROM catalog_fts WHERE catalog_fts MATCH ?`);
const q2 = db.prepare(
  `SELECT c.name FROM catalog_fts f JOIN catalog c ON c.id=f.rowid WHERE catalog_fts MATCH ? ORDER BY rank LIMIT 25`
);
const q3 = db.prepare(
  `SELECT c.name FROM catalog_fts f JOIN catalog c ON c.id=f.rowid WHERE catalog_fts MATCH ? LIMIT 25`
);
const q4 = db.prepare(
  `SELECT COUNT(*) AS c FROM (SELECT rowid FROM catalog_fts WHERE catalog_fts MATCH ? LIMIT 1001)`
);

console.log('query = "para"  (17,924 matches)\n');
time("A. full COUNT(*)  [current]", () => q1.get(MATCH));
time("B. SELECT ORDER BY rank LIMIT 25", () => q2.all(MATCH));
time("C. SELECT no-order LIMIT 25", () => q3.all(MATCH));
time("D. capped COUNT (LIMIT 1001)", () => q4.get(MATCH));
time("A+B combined [current endpoint]", () => {
  q1.get(MATCH);
  q2.all(MATCH);
});
time("D+B proposed", () => {
  q4.get(MATCH);
  q2.all(MATCH);
});

console.log('\nquery = "augmentin" (8 matches)\n');
const M2 = '"augmentin"';
time("A. full COUNT(*)", () => q1.get(M2));
time("B. SELECT ORDER BY rank LIMIT 25", () => q2.all(M2));
time("D+B proposed", () => {
  q4.get(M2);
  q2.all(M2);
});
db.close();
