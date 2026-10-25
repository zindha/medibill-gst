"""Discover + capture LocalWell submenu children (Invoices, Cash and Bank).

Env: LW_MOBILE / LW_PASSWORD. Reuses login from capture_localwell.py.
Outputs: localwell-captures/sub_<name>.txt (+ .png) per discovered child route.
"""
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from capture_localwell import BASE, visible_text  # noqa: E402
from capture_localwell import login  # noqa: E402

OUT = Path(__file__).parent / "localwell-captures"
SUBMENU_LABELS = ["Invoices", "Cash and Bank"]


def dump_routes(page, tag: str):
    """Collect sidebar route hints (alt attrs) + visible text after an expansion."""
    html = page.content()
    routes = [m for m in re.findall(r'alt="(/[^"]+)"', html)]
    text = visible_text(page)
    print(f"--- after expanding {tag!r}: routes={sorted(set(routes))}")
    return routes, text


def main():
    if not os.environ.get("LW_MOBILE"):
        print("Set LW_MOBILE / LW_PASSWORD", file=sys.stderr)
        sys.exit(2)
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        login(page)
        all_routes: dict[str, str] = {}

        for label in SUBMENU_LABELS:
            item = page.locator("[class^='app-menu_AMenuItemContent']", has_text=label).first
            if item.count() == 0:
                print(f"sidebar item {label!r} not found", file=sys.stderr)
                continue
            item.click()
            page.wait_for_timeout(2000)
            routes, text = dump_routes(page, label)
            safe = label.lower().replace(" ", "-")
            (OUT / f"submenu_{safe}.txt").write_text(
                f"URL: {page.url}\nROUTES: {sorted(set(routes))}\n\n{text}", encoding="utf-8"
            )
            for r in routes:
                all_routes.setdefault(r, safe)
            # Collapse it again so the next expansion is unambiguous.
            item.click()
            page.wait_for_timeout(1200)

        # Visit each newly discovered child route and capture it.
        for route, owner in sorted(all_routes.items()):
            if any(route in existing for existing in (
                "/dashboard/view-dashboard", "/customer-orders", "/orderbook/dashboard",
                "/reports/business-reports", "/reminders/view-reminders",
                "/expenses/view-expenses", "/stocks/view-stocks", "/stock-audit",
                "/control-center/business-profile", "/support/account-manager",
                "/stocks/stock-transfer/view-transfers",
            )):
                continue
            name = f"child_{owner}_{route.strip('/').replace('/', '_')}"
            resp = page.goto(BASE + route, wait_until="domcontentloaded")
            page.wait_for_timeout(3500)
            status = resp.status if resp else "?"
            text = visible_text(page)
            is_404 = "This page could not be found" in text
            page.screenshot(path=str(OUT / f"{name}.png"))
            (OUT / f"{name}.txt").write_text(
                f"URL: {page.url}\nHTTP: {status}\n404: {is_404}\n\n{text}", encoding="utf-8"
            )
            print(f"{name:55} {status}{'' if not is_404 else ' [404]'}")
        browser.close()
    print("done")


if __name__ == "__main__":
    main()
