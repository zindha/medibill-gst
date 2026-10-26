"""Per-screen side-by-side audit: MediBill vs LocalWell references.

Registers a throwaway user, logs in, captures every mapped screen
(screenshot + visible text), asserts LocalWell keywords, and writes
audit-report.html with side-by-side image pairs + verdicts.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(os.environ.get("MB_AUDIT_OUT", str(Path(__file__).parent / "localwell-captures" / "audit")))
OUT.mkdir(parents=True, exist_ok=True)
APP = "http://localhost:5173"
# Token minted via apps/server/audit-user.mts (server-side createUser + createSession).
PRESET_TOKEN = os.environ.get("MB_TOKEN", "")

# route -> (screen name, LocalWell reference png (or None), required keywords)
# Keywords are data-independent: placeholders/empty-table headers excluded.
SCREENS = {
    "/auth": ("login", None,
        ["Login or Sign Up", "Sign In to Continue", "Submit to Login",
         "Terms of Service", "Privacy Policy", "+91", "/10"]),
    "/dashboard": ("dashboard", "dashboard.png",
        ["Net Sales", "Profit", "Net Purchase", "Net Payment Collection", "Stock Value",
         "Due Payments", "Refill Reminders", "Fast Moving"]),
    "/dashboard/inventory": ("stock", None,
        ["Stock on hand", "SKU:", "Stock Value", "Add New Item", "Order Now", "Settings",
         "Show Zero Qty Batches"]),
    "/dashboard/expenses": ("expenses", "expenses.png",
        ["Business Expenses", "Be it Rent or Salaries", "Add New Expense", "No data"]),
    "/dashboard/orders": ("customer_orders", "customer_orders.png",
        ["Customer Orders", "List of Online & Offline Customer Orders", "Refresh"]),
    "/dashboard/reports": ("business_reports", "business_reports.png",
        ["Business Reports", "View & Download Reports in CSV, PDF or XLS"]),
    "/dashboard/invoices": ("sales_transactions", "child_invoices_transactions_sales.png",
        ["Sales Transactions", "View List of all your Sales Transactions here",
         "Sales Count", "Sales Amt Sum", "Sales Net Profit", "Payable Sum", "Balance Sum"]),
    "/dashboard/payment-accounts": ("payment_accounts", "child_cash-and-bank_cash-and-bank.png",
        ["Payment Accounts", "Never loose track of your Cash Flow & Accounts"]),
    "/dashboard/cash-bank": ("cash_bank_cheques", "child_cash-and-bank_cash-and-bank_cheque-management.png",
        ["Cheque Register", "Add Cheque", "Pending", "Cleared"]),
    "/dashboard/purchases": ("purchases", "child_invoices_transactions_purchases.png",
        ["Purchases Transactions", "View List of all your Purchases Transactions here",
         "Purchase Returns Transactions"]),
    "/dashboard/returns": ("sale_returns", "child_invoices_transactions_sale-returns.png",
        ["Sale Returns Transactions", "View List of all your Sale Returns Transactions here",
         "Create New Sale Returns"]),
    "/dashboard/refills": ("patient_followups", "patient_followups.png",
        ["Patient Follow-ups", "Start building relationship with your customers",
         "Arriving", "Expired", "No Followups Found!"]),
    "/dashboard/orderbook": ("orderbook", "orderbook.png",
        ["Orderbook Dashboard", "List of Stock Products which are in Shortage",
         "Shortbook Items"]),
    "/dashboard/settings": ("control_centre", "control_center.png",
        ["Control Centre", "Select an option below to edit", "Business Profile"]),
}


def visible_text(page):
    return page.evaluate("() => (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n')")


def main():
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(APP, wait_until="domcontentloaded")

        token = PRESET_TOKEN
        if not token:
            # Fallback: register a throwaway user inside the app origin.
            reg = page.evaluate(
                """async () => {
                    const res = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ name: 'Audit Bot', email: 'audit-bot@medibill.test',
                                               phone: '9999999999', password: 'audit-pass-123' }),
                    });
                    const body = await res.json();
                    return { status: res.status, body };
                }"""
            )
            token = ((reg.get("body") or {}).get("data") or {}).get("token")
        if not token:
            print("AUTH FAILED: no token (set MB_TOKEN)")
            raise SystemExit(2)
        print("auth ok")

        for route, (name, lw_png, keywords) in SCREENS.items():
            # /auth must be captured unauthenticated (it redirects when logged in).
            if route == "/auth":
                page.evaluate("() => localStorage.removeItem('medibill_auth_token')")
            page.goto(APP + route, wait_until="domcontentloaded")
            # Poll until the first expected keyword renders (lazy chunks + data
            # fetch can take seconds on a cold dev server), capped at 18s.
            try:
                page.wait_for_function(
                    "k => (document.body.innerText || '').includes(k)",
                    arg=keywords[0], timeout=18000,
                )
            except Exception:
                pass
            # Tabbed screens: activate the audited tab before capture.
            if route == "/dashboard/cash-bank":
                tab = page.locator("[role='tab']", has_text="Cheques").first
                if tab.count():
                    tab.click()
                    page.wait_for_timeout(1500)
            if route == "/dashboard/purchases":
                tab = page.locator("[role='tab']", has_text="Purchase Returns").first
                if tab.count():
                    tab.click()
                    page.wait_for_timeout(1500)
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            page.wait_for_timeout(1200)
            if route == "/auth":
                page.evaluate("t => localStorage.setItem('medibill_auth_token', t)", token)
            text = visible_text(page)
            page.screenshot(path=str(OUT / f"mb_{name}.png"))
            missing = [k for k in keywords if k not in text]
            verdict = "PASS" if not missing else f"DRIFT ({len(missing)} missing)"
            results.append({"route": route, "name": name, "lw_png": lw_png,
                            "verdict": verdict, "missing": missing})
            (OUT / f"mb_{name}.txt").write_text(text, encoding="utf-8")
            print(f"{name:20} {verdict}" + (f"  missing={missing}" if missing else ""))

        browser.close()

    # Side-by-side HTML report for human eyeballing.
    rows = []
    for r in results:
        lw = f'<img src="../{r["lw_png"]}" loading="lazy">' if r["lw_png"] else "<p class='none'>no LW capture (DOM-text reference)</p>"
        mb = f'<img src="mb_{r["name"]}.png" loading="lazy">'
        miss = ("<ul>" + "".join(f"<li>{m}</li>" for m in r["missing"]) + "</ul>") if r["missing"] else ""
        rows.append(f"""
        <section>
          <h2>{r['name']} <span class='{"pass" if r["verdict"].startswith("PASS") else "drift"}'>{r['verdict']}</span></h2>
          <div class='pair'><figure><figcaption>LocalWell</figcaption>{lw}</figure>
          <figure><figcaption>MediBill ({r['route']})</figcaption>{mb}</figure></div>
          {miss}
        </section>""")
    html = f"""<!doctype html><meta charset='utf-8'><title>LocalWell vs MediBill — screen audit</title>
<style>body{{font-family:system-ui;background:#1b1d24;color:#eee;margin:24px}}h1{{font-size:20px}}
section{{margin:28px 0;border-top:1px solid #333;padding-top:12px}}h2{{font-size:15px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}figure{{margin:0}}
figcaption{{font-size:12px;color:#9a9aa5;margin-bottom:6px}}img{{width:100%;border:1px solid #333;border-radius:6px}}
.pass{{color:#4ade80;font-size:12px}}.drift{{color:#f87171;font-size:12px}}.none{{color:#777;font-size:12px}}
li{{color:#fca5a5;font-size:12px}}</style>
<h1>LocalWell vs MediBill — per-screen audit ({len(results)} screens)</h1>{''.join(rows)}"""
    (OUT.parent / "audit-report.html").write_text(html, encoding="utf-8")
    print(f"\nreport: localwell-captures/audit-report.html")


if __name__ == "__main__":
    main()
