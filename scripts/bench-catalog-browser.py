from playwright.sync_api import sync_playwright
import json, sys

TARGETS = [
    ("LOCAL", "http://127.0.0.1:3000"),
    ("TUNNEL", "https://suit-ranch-competitions-tsunami.trycloudflare.com"),
]

INSTRUMENT = """async () => {
    const out = {};
    const t0 = performance.now();
    const res = await fetch('/medicineCatalog.jsonl');
    const buf = await res.arrayBuffer();
    const t1 = performance.now();
    const text = new TextDecoder().decode(buf);
    const t2 = performance.now();
    const rows = text.split('\\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
    const t3 = performance.now();

    out.bytes = buf.byteLength;
    out.rows = rows.length;
    out.download_ms = Math.round(t1 - t0);
    out.decode_ms = Math.round(t2 - t1);
    out.parse_ms = Math.round(t3 - t2);
    out.heapMB = Math.round(performance.memory ? performance.memory.usedJSHeapSize/1048576 : -1);

    // search cost (worst case: no hit -> full scan of all rows)
    const search = (q, limit) => {
        const s = performance.now();
        const o = [];
        for (const row of rows) {
            if (o.length >= limit) break;
            if (!(row.n.toLowerCase().includes(q) || row.c.toLowerCase().includes(q) || row.s.toLowerCase().includes(q))) continue;
            o.push(row);
        }
        return { ms: Math.round(performance.now() - s), hits: o.length };
    };
    out.search = {};
    for (const q of ['para','dolo','zzzznotfound','xyzzy']) out.search[q] = search(q, 25);
    return out;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for label, base in TARGETS:
        page = browser.new_page()
        print(f"\n================ {label}: {base} ================")
        try:
            page.goto(base, wait_until="domcontentloaded", timeout=60000)
            r = page.evaluate(INSTRUMENT)
            print(f"  payload      : {r['bytes']/1048576:.1f} MB")
            print(f"  rows         : {r['rows']:,}")
            print(f"  DOWNLOAD     : {r['download_ms']} ms")
            print(f"  text decode  : {r['decode_ms']} ms")
            print(f"  JSON.parse   : {r['parse_ms']} ms   <-- blocks main thread")
            print(f"  => TOTAL     : {r['download_ms']+r['decode_ms']+r['parse_ms']} ms")
            print(f"  JS heap      : {r['heapMB']} MB")
            print("  search (per keystroke):")
            for q, v in r["search"].items():
                print(f"     {q:<14} {v['ms']:>5} ms  ({v['hits']} hits)")
        except Exception as e:
            print("  ERROR:", e)
        page.close()
    browser.close()
