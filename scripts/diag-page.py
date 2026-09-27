from playwright.sync_api import sync_playwright
import json, subprocess

BASE = "http://127.0.0.1:3000"
tok = subprocess.run(
    ["node", "-e",
     "const D=require('better-sqlite3');"
     "const db=new D('C:/ProgramData/MediBill/data/medibill.db',{readonly:true});"
     "const s=db.prepare('SELECT token FROM sessions WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1')"
     ".get(Math.floor(Date.now()/1000));process.stdout.write(s.token);"],
    capture_output=True, text=True, cwd="D:/Projects/MediBillGST/apps/server",
).stdout.strip()

msgs, errs = [], []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.evaluate(f"localStorage.setItem('medibill_auth_token', {json.dumps(tok)})")
    page.goto(f"{BASE}/dashboard/inventory", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(2000)

    print("=== PAGE ERRORS ===")
    print("\n".join(errs) if errs else "(none)")
    print("\n=== CONSOLE (error/warn) ===")
    bad = [m for m in msgs if m.startswith(("[error]", "[warning]"))]
    print("\n".join(bad[:20]) if bad else "(none)")
    print("\n=== VISIBLE TEXT (first 40 lines) ===")
    for l in [x for x in page.inner_text("body").split("\n") if x.strip()][:40]:
        print("  ", l[:140])
    b.close()
