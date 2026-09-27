from playwright.sync_api import sync_playwright
import json, subprocess, time, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
tok = subprocess.run(
    ["node", "-e",
     "const D=require('better-sqlite3');"
     "const db=new D('C:/ProgramData/MediBill/data/medibill.db',{readonly:true});"
     "const s=db.prepare('SELECT token FROM sessions WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1')"
     ".get(Math.floor(Date.now()/1000));process.stdout.write(s.token);"],
    capture_output=True, text=True, cwd="D:/Projects/MediBillGST/apps/server",
).stdout.strip()

reqs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    page.on("request", lambda r: reqs.append(r.url))
    page.goto(BASE, wait_until="domcontentloaded")
    page.evaluate(f"localStorage.setItem('medibill_auth_token', {json.dumps(tok)})")
    page.goto(f"{BASE}/dashboard/billing", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    print("billing page loaded:", page.url)

    # The catalog search lives inside the "Add Item" picker modal.
    add = page.get_by_role("button", name="Add Item")
    if add.count():
        add.first.click()
        page.wait_for_timeout(900)
    # The picker opens from the magnifier icon on a line item.
    trigger = page.get_by_title("Search or scan barcode")
    if trigger.count() == 0:
        add = page.get_by_role("button", name="Add Item")
        if add.count():
            add.first.click()
            page.wait_for_timeout(700)
        trigger = page.get_by_title("Search or scan barcode")
    print("picker trigger found:", trigger.count() > 0)
    if trigger.count():
        trigger.first.click()
        page.wait_for_timeout(800)

    sel = 'input[placeholder="Search medicines by name or brand..."]'
    print("dialog search input:", page.locator(sel).count() > 0)
    if page.locator(sel).count():
        inp = page.locator(sel).first
        inp.click()
        t0 = time.time()
        inp.type("dolo", delay=30)
        page.wait_for_timeout(2000)
        elapsed = (time.time() - t0) * 1000
        body = page.inner_text("body")
        hits = [l for l in body.split("\n") if "Tablet" in l or "Syrup" in l or "Capsule" in l][:6]
        print(f"typed->suggestions in ~{elapsed:.0f} ms")
        print("sample suggestions:")
        for h in hits:
            print("   ", h.strip()[:110])
        page.screenshot(path="D:/Projects/MediBillGST/verify-billing.png", full_page=True)

    print("\n37MB dataset requests:", len([u for u in reqs if "medicineCatalog.jsonl" in u]))
    print("catalog search requests:", len([u for u in reqs if "/api/catalog/search" in u]))
    b.close()
