"""Capture LocalWell screens for the replication spec.

One run = one login (the free-plan account has a concurrent-device limit,
so every screen below must be harvested in a single session).

Outputs: localwell-captures/<name>.png + <name>.txt (visible text) per route.
"""
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://pharmacy.localwell.in"
# Credentials stay out of the repo — export LW_MOBILE / LW_PASSWORD before running.
MOBILE = os.environ.get("LW_MOBILE", "")
PASSWORD = os.environ.get("LW_PASSWORD", "")
OUT = Path(__file__).parent / "localwell-captures"

# name -> path; None = submenu route unknown, try pattern guesses marked *.
ROUTES = {
    "dashboard": "/dashboard/view-dashboard",
    "invoices_guess": "/invoices/view-invoices",          # * pattern guess
    "customer_orders": "/customer-orders",
    "orderbook": "/orderbook/dashboard",
    "business_reports": "/reports/business-reports",
    "patient_followups": "/reminders/view-reminders",
    "expenses": "/expenses/view-expenses",
    "cash_bank_guess": "/cash-and-bank/view-cash",        # * pattern guess
    "stock_audit": "/stock-audit",
    "control_center": "/control-center/business-profile",
}


def visible_text(page) -> str:
    return page.evaluate(
        "() => { const t = document.body.innerText || ''; return t.replace(/\\n{3,}/g, '\\n\\n'); }"
    )


def _validate(page) -> str:
    """Submit mobile + password once; return the landed URL."""
    for _ in range(3):
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("input#username", timeout=12000)
            break
        except Exception:
            print(f"login page not ready, url={page.url}", file=sys.stderr)
            continue
    page.fill("input#username", MOBILE)
    page.click("div.lib-button_libButtonDark__W8OnN")
    page.wait_for_selector("input#password", timeout=20000)
    page.fill("input#password", PASSWORD)
    page.click("div.lib-button_libButtonDark__W8OnN")
    page.wait_for_url(re.compile(r"/(stocks|login)"), timeout=25000)
    page.wait_for_timeout(4000)
    return page.url


def _free_a_device_slot(page) -> bool:
    """On /login/login-exhausted, log out the stale device session. True if we acted."""
    if "login-exhausted" not in page.url:
        return False
    page.goto(f"{BASE}/login/login-exhausted", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    icon = page.locator("[class^='user-card_logoutIcon'], [class^='user-card_actionIcon']")
    if icon.count() == 0:
        print("exhausted page has no device logout control", file=sys.stderr)
        return False
    icon.first.click()
    page.wait_for_timeout(1800)
    # Confirm only inside an actual dialog/modal (never the card header text).
    dialog = page.locator("[role='dialog'], .modal, .dialog, .lib-modal")
    clicked_confirm = False
    if dialog.count() and dialog.first.is_visible():
        for label in ("Logout", "Log out", "Yes", "Confirm", "Remove"):
            btn = dialog.first.locator(f"button:has-text('{label}'), div.lib-button_libButtonDark:has-text('{label}')")
            if btn.count() and btn.first.is_visible():
                btn.first.click()
                clicked_confirm = True
                page.wait_for_timeout(1800)
                break
    print("freed one device slot via logout"
          + (" (+confirm)" if clicked_confirm else " (no dialog)"))
    page.wait_for_timeout(1500)
    return True


def login(page):
    url = _validate(page)
    # Free plan caps concurrent devices — evict the stale session once if needed.
    for _ in range(2):
        if "/stocks/" in url:
            print(f"LOGIN OK -> {url}")
            return
        if _free_a_device_slot(page):
            url = _validate(page)
            continue
        break
    text = visible_text(page)
    print(f"LOGIN FAILED (landed {url}):\n{text[:800]}", file=sys.stderr)
    sys.exit(2)


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        login(page)
        print(f"LOGIN OK -> {page.url}")
        for name, path in ROUTES.items():
            resp = page.goto(BASE + path, wait_until="domcontentloaded")
            page.wait_for_timeout(3500)  # client-side data fetch
            status = resp.status if resp else "?"
            text = visible_text(page)
            is_404 = "This page could not be found" in text
            page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
            (OUT / f"{name}.txt").write_text(
                f"URL: {page.url}\nHTTP: {status}\n404: {is_404}\n\n{text}",
                encoding="utf-8",
            )
            flag = " [404]" if is_404 else ""
            print(f"{name:22} {status} {path}{flag}")
        browser.close()
    print(f"\nSaved to {OUT}")


if __name__ == "__main__":
    main()
