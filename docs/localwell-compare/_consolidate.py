import re, pathlib, json

BASE = pathlib.Path(r"D:\Projects\MediBillGST\docs\localwell-compare")
PARTS = [BASE / "_refparts" / f"part-{p}.md" for p in
         ["1", "2", "3", "4", "5a", "5b", "5c", "6"]]

SEC_ORDER = ["sale", "invoices", "transactions", "reminders", "purchase", "orderbook",
             "stocks", "stock-audit", "dashboard", "customer-orders", "reports",
             "cash-and-bank", "expenses", "control-center", "integrations", "settings",
             "subscriptions", "support", "login", "misc"]

SEC_TITLE = {
    "sale": "Sale & customers",
    "invoices": "Invoices & document printing",
    "transactions": "Transactions",
    "reminders": "Reminders / patient follow-ups",
    "purchase": "Purchase",
    "orderbook": "Orderbook (procurement workspace)",
    "stocks": "Stocks",
    "stock-audit": "Stock audit",
    "dashboard": "Dashboard",
    "customer-orders": "Customer orders (B2B / marketplace side)",
    "reports": "Reports",
    "cash-and-bank": "Cash & bank",
    "expenses": "Expenses",
    "control-center": "Control centre",
    "integrations": "Integrations / partner onboarding",
    "settings": "Settings",
    "subscriptions": "Subscriptions",
    "support": "Support",
    "login": "Login & access",
    "misc": "Miscellaneous",
}


def section_of(route):
    r = route
    if r in ("/", "/_error", "/upload-migration-data"):
        return "misc"
    if r.startswith("/login"):
        return "login"
    if r.startswith("/support"):
        return "support"
    if r.startswith("/subscriptions"):
        return "subscriptions"
    if r.startswith("/settings"):
        return "settings"
    if r.startswith("/integrations"):
        return "integrations"
    if r.startswith("/control-center"):
        return "control-center"
    if r.startswith("/expenses"):
        return "expenses"
    if r.startswith("/cash-and-bank"):
        return "cash-and-bank"
    if r.startswith("/reports"):
        return "reports"
    if r.startswith("/customer-orders"):
        return "customer-orders"
    if r.startswith("/dashboard"):
        return "dashboard"
    if r.startswith("/stock-audit"):
        return "stock-audit"
    if r.startswith("/stocks"):
        return "stocks"
    if r.startswith("/orderbook"):
        return "orderbook"
    if r.startswith("/purchase"):
        return "purchase"
    if r.startswith("/reminders"):
        return "reminders"
    if r.startswith("/transactions"):
        return "transactions"
    if r.startswith("/invoices"):
        return "invoices"
    if r.startswith("/sale/") or r == "/sales-routes":
        return "sale"
    return "misc"


def parse():
    pages = []
    seen = {}
    for f in PARTS:
        text = f.read_text(encoding="utf-8")
        # drop part headers
        text = re.sub(r"^# Reference part .*\n+", "", text, flags=re.M)
        blocks = re.split(r"\n(?=### )", text)
        for b in blocks:
            b = b.strip()
            if not b.startswith("### "):
                continue
            head, _, rest = b.partition("\n")
            m = re.match(r"###\s+(\S+)\s+·\s+chunk:\s*(\S+)", head.strip())
            if not m:
                print("UNPARSED HEAD:", head[:80])
                continue
            route, chunk = m.group(1), m.group(2)
            if route in seen:
                print("DUPLICATE ROUTE:", route, "in", f.name, "and", seen[route])
            seen[route] = f.name
            fields = {}
            cur = None
            for line in rest.splitlines():
                if not line.strip():
                    continue
                m2 = re.match(r"^(Features|Interactions|API|Entities|Notes):\s*(.*)$", line.strip())
                if m2:
                    cur = m2.group(1)
                    fields[cur] = [m2.group(2)] if m2.group(2).strip() else []
                elif cur and line.strip().startswith("- "):
                    fields[cur].append(line.strip()[2:].strip())
                elif cur:
                    fields[cur][-1] = fields[cur][-1] + " " + line.strip()
            pages.append({"route": route, "chunk": chunk, "fields": fields,
                          "source": f.name, "section": section_of(route)})
    return pages


def render(pages):
    out = []
    out.append("# LocalWell reference — consolidated screen inventory")
    out.append("")
    out.append("Reference spec for the feature-parity audit. Every screen below was derived from the "
               "shipped reference front-end bundles; this document restates what each page does in our own words "
               "and keeps the original per-page evidence fields (route, chunk of origin, capabilities, "
               "interactions, data entities and backend operations).")
    out.append("")
    out.append("## Method & conventions")
    out.append("")
    out.append("- **Pages analysed:** 93 reference page bundles (`static/chunks/pages/**`) across the "
               "reference app's Next.js pages router, covering every screen in the shipped chunk set.")
    out.append("- **How routes were derived:** each page's route path is taken from its bundle filename "
               "(`static__chunks__pages__<section>__<page>-<hash>.js`); nested segments such as "
               "`[sale_id]`, `[stock_audit_id]`, `[report_id]`, `[ticket_id]`, `[order_id]`, "
               "`[distributor_id]` and `[...params]` are dynamic route parameters, so one bundle can serve "
               "several document kinds.")
    out.append("- **Backend calls:** the reference dispatches every backend call through a shared request "
               "helper that takes a *named service operation* (for example `business_get_profile`, "
               "`tickets_sync_tickets`). No page bundle contains a literal `/api/...` URL string — endpoint "
               "identity lives in a runtime service bundle that was not part of the page set. The `API` field "
               "on each page therefore lists the operation identifiers the page actually invokes, which is the "
               "closest observable equivalent of an endpoint path.")
    out.append("- **Operation catalogue:** `ref-api-operations.md` catalogues 552 distinct operation "
               "identifiers invoked by the reference UI; 272 of them resolve to concrete request paths "
               "(e.g. `business_get_profile` -> `/app/business/get_business_profile`, "
               "`customer_orders_get_orders` -> `/app/customer_order/get_orders`). The remaining 280 are "
               "invoked but were not recovered from the service registry.")
    out.append("- **Page fields:** `Features` = what the user can do on the page; `Interactions` = how the user "
               "drives it (keyboard shortcuts, modals, filters, workflows); `Entities` = the notable data "
               "objects the page works with; `API` = the named service operations it dispatches; `Notes` = "
               "behaviours worth calling out for parity work.")
    out.append("- **Status of this document:** this is the *reference* side of the comparison only. "
               "Coverage of our own app lives in `parity-matrix.md`; the API-side capability view lives in "
               "`ref-api-operations.md`.")
    out.append("")
    out.append("## Table of contents")
    out.append("")
    by_sec = {}
    for p in pages:
        by_sec.setdefault(p["section"], []).append(p)
    for s in SEC_ORDER:
        ps = by_sec.get(s, [])
        if not ps:
            continue
        out.append(f"- **{SEC_TITLE[s]}** (`{s}`) — {len(ps)} page(s)")
        for p in ps:
            anchor = p["route"].strip("/").replace("/", "-").replace("[", "").replace("]", "")
            if not anchor:
                anchor = "root"
            out.append(f"  - [`{p['route']}`](#{anchor})")
    out.append("")
    out.append("---")
    out.append("")

    for s in SEC_ORDER:
        ps = by_sec.get(s, [])
        if not ps:
            continue
        out.append(f"## {SEC_TITLE[s]}")
        out.append("")
        for p in ps:
            anchor = p["route"].strip("/").replace("/", "-").replace("[", "").replace("]", "")
            if not anchor:
                anchor = "root"
            out.append(f"<a id=\"{anchor}\"></a>")
            out.append("")
            out.append(f"### `{p['route']}`")
            out.append("")
            out.append(f"- **Chunk of origin:** `{p['chunk']}`")
            for key, label in [("Features", "What the user can do"),
                               ("Interactions", "Interactions"),
                               ("Entities", "Notable entities & workflows"),
                               ("API", "Backend operations"),
                               ("Notes", "Notes")]:
                vals = p["fields"].get(key, [])
                if key == "API":
                    if not vals:
                        continue
                    ops = []
                    for v in vals:
                        ops.extend(re.findall(r"`([^`]+)`", v))
                        if not ops:
                            ops.append(v.strip())
                    out.append(f"- **{label}:** " + ", ".join(f"`{o}`" for o in ops if o and o != "—"))
                else:
                    if not vals:
                        continue
                    out.append(f"- **{label}:**")
                    for v in vals:
                        out.append(f"  - {v}")
            out.append("")
    return "\n".join(out) + "\n"


pages = parse()
print("pages parsed:", len(pages))
missing = [p["route"] for p in pages if not p["fields"].get("Features")]
print("pages without Features:", missing)
(BASE / "ref-screens.md").write_text(render(pages), encoding="utf-8")

# digest for matrix authoring
dig = []
for p in pages:
    f = p["fields"]
    api = " ".join(f.get("API", []))
    ops = re.findall(r"`([^`]+)`", api)
    if not ops:
        ops = [x.strip() for x in re.split(r",", api) if x.strip() and x.strip() != "—"]
    first = (f.get("Features", [""]) or [""])[0]
    dig.append(f"{p['route']}\t{p['section']}\t{first[:160]}\t{','.join(ops)}")
(BASE / "_refparts" / "_digest.tsv").write_text("\n".join(dig), encoding="utf-8")
print("written ref-screens.md and _digest.tsv")
