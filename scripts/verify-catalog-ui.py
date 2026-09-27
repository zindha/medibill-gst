from playwright.sync_api import sync_playwright
import json, subprocess, time, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"

# Reuse a valid server-side session (read-only UI test).
tok = subprocess.run(
    ["node", "-e",
     "const D=require('better-sqlite3');"
     "const db=new D('C:/ProgramData/MediBill/data/medibill.db',{readonly:true});"
     "const s=db.prepare('SELECT token FROM sessions WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1')"
     ".get(Math.floor(Date.now()/1000));process.stdout.write(s.token);"],
    capture_output=True, text=True, cwd="D:/Projects/MediBillGST/apps/server",
).stdout.strip()
print("session token:", tok)

requests = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()

    page.on("request", lambda r: requests.append(r.url))
    page.on("console", lambda m: None)

    # Inject the session before the app boots
    page.goto(BASE, wait_until="domcontentloaded")
    page.evaluate(f"localStorage.setItem('medibill_auth_token', {json.dumps(tok)})")

    t_nav = time.time()
    page.goto(f"{BASE}/dashboard/inventory", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    print(f"inventory page ready in {(time.time()-t_nav)*1000:.0f} ms")
    page.screenshot(path="D:/Projects/MediBillGST/verify-inventory.png", full_page=True)

    # Locate the catalog search input (lives behind the "Medicine DB" tab)
    sel = 'input[placeholder="Search by name, company, or composition..."]'
    if page.locator(sel).count() == 0:
        btn = page.get_by_role("button", name="Medicine DB")
        if btn.count():
            btn.first.click()
            page.wait_for_timeout(800)
    if page.locator(sel).count() == 0:
        print("search input still not visible; buttons on page:")
        for i in range(min(page.locator("button").count(), 25)):
            t = (page.locator("button").nth(i).inner_text() or "").strip().replace("\n", " ")
            if t:
                print(f"   [{i}] {t[:60]}")
        raise SystemExit("could not reveal the search surface")
    print("search surface opened")

    # ---- THE MEASUREMENT: type a query, time until results render ----
    for query in ["para", "cillin"]:
        inp = page.locator(sel)
        inp.fill("")
        page.wait_for_timeout(400)
        t0 = time.time()
        inp.type(query, delay=30)
        # wait until the "N medicines found" text stops saying Loading and result rows exist
        try:
            page.wait_for_function(
                """() => {
                    const t = document.body.innerText;
                    return /medicines found/.test(t) && !/Loading\\.\\.\\./.test(t);
                }""",
                timeout=15000,
            )
            elapsed = (time.time() - t0) * 1000
        except Exception as e:
            elapsed = -1
            print(f"  [{query}] timed out waiting for results: {e}")
        body = page.inner_text("body")
        line = next((l for l in body.split("\n") if "medicines found" in l), "")
        print(f"  query={query!r:10} typed->results: {elapsed:.0f} ms   UI says: {line.strip()!r}")
        page.screenshot(path=f"D:/Projects/MediBillGST/verify-search-{query}.png", full_page=True)

    # ---- Network assertions ----
    print("\n--- network evidence ---")
    big = [u for u in requests if "medicineCatalog.jsonl" in u]
    search = [u for u in requests if "/api/catalog/search" in u]
    print(f"requests for the 37MB dataset : {len(big)}  {'(GOOD)' if not big else '(BAD: ' + str(big) + ')'}")
    print(f"requests to /api/catalog/search: {len(search)}")
    for u in search:
        print("   ", u.replace(BASE, ""))

    browser.close()
