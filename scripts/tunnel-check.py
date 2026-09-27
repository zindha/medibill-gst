from playwright.sync_api import sync_playwright

BASE = "https://suit-ranch-competitions-tsunami.trycloudflare.com"

errors, console_msgs, failed_requests = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed_requests.append(f"{r.method} {r.url} -> {r.failure}"))

    # 1. Landing page
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    print("LANDING title:", page.title())
    print("LANDING text:", " | ".join(page.inner_text("body").split("\n")[:4]))
    page.screenshot(path="D:/Projects/MediBillGST/tunnel-landing.png", full_page=True)

    # 2. Auth / login page
    page.goto(f"{BASE}/auth", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(2000)
    inputs = page.locator("input")
    print("\nAUTH url:", page.url)
    print("AUTH text:", " | ".join(page.inner_text("body").split("\n")[:8]))
    print("AUTH inputs:", inputs.count())
    for i in range(inputs.count()):
        print(f"   input[{i}] type={inputs.nth(i).get_attribute('type')} placeholder={inputs.nth(i).get_attribute('placeholder')}")
    page.screenshot(path="D:/Projects/MediBillGST/tunnel-auth.png", full_page=True)

    # 3. Exercise a real API call FROM THE BROWSER (same-origin relative path)
    api_result = page.evaluate("""async () => {
        const r = await fetch('/api/health');
        return { status: r.status, body: await r.text() };
    }""")
    print("\nBROWSER fetch('/api/health') ->", api_result)

    # 4. Confirm the app's own auth probe now hits a relative URL
    print("\n--- FAILED REQUESTS ---")
    print("\n".join(failed_requests) if failed_requests else "(none)")
    print("\n--- JS ERRORS ---")
    print("\n".join(errors) if errors else "(none)")
    print("\n--- CONSOLE (errors/warnings only) ---")
    bad = [m for m in console_msgs if m.startswith(("[error]", "[warning]"))]
    print("\n".join(bad[:15]) if bad else "(none)")

    browser.close()
