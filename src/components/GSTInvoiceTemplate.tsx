import type { Id } from "@/convex/_generated/dataModel";

interface InvoiceItem {
  medicineName: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  gstRate: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
}

interface InvoiceData {
  invoiceNo: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  paymentMode?: string;
  subtotal: number;
  totalGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount?: number;
  grandTotal: number;
  notes?: string;
  items: InvoiceItem[];
}

interface GSTInvoiceTemplateProps {
  invoice: InvoiceData;
  shopName?: string;
  shopAddress?: string;
  shopGstin?: string;
  shopPhone?: string;
}

const numberToWords = (num: number): string => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  const convertBelow1000 = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertBelow1000(n % 100) : "");
  };

  if (num === 0) return "Zero";
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let words = "";
  if (whole >= 10000000) {
    words += convertBelow1000(Math.floor(whole / 10000000)) + " Crore ";
    whole %= 10000000;
  }
  if (whole >= 100000) {
    words += convertBelow1000(Math.floor(whole / 100000)) + " Lakh ";
    whole %= 100000;
  }
  if (whole >= 1000) {
    words += convertBelow1000(Math.floor(whole / 1000)) + " Thousand ";
    whole %= 1000;
  }
  words += convertBelow1000(whole);
  words += " Rupees";
  if (paise > 0) {
    words += " and " + convertBelow1000(paise) + " Paise";
  }
  words += " Only";
  return words.trim();
};

export function GSTInvoiceTemplate({
  invoice,
  shopName = "MediBill Pharmacy",
  shopAddress = "123, Medical Complex, Main Road, City - 400001",
  shopGstin = "27AABCU1234D1Z5",
  shopPhone = "+91 98765 43210",
}: GSTInvoiceTemplateProps) {
  return (
    <div className="gst-invoice-print">
      {/* Shop Header */}
      <div className="invoice-header">
        <div className="header-top">
          <h1 className="shop-name">{shopName}</h1>
          <p className="shop-address">{shopAddress}</p>
          <p className="shop-contact">
            GSTIN: <strong>{shopGstin}</strong> | Phone: {shopPhone}
          </p>
        </div>
        <div className="invoice-title-row">
          <h2 className="invoice-title">TAX INVOICE</h2>
          <div className="invoice-meta">
            <p>
              <span className="meta-label">Invoice No:</span>{" "}
              <strong>{invoice.invoiceNo}</strong>
            </p>
            <p>
              <span className="meta-label">Date:</span>{" "}
              {new Date(invoice.date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
            <p>
              <span className="meta-label">Payment:</span>{" "}
              {invoice.paymentMode || "Cash"}
            </p>
          </div>
        </div>
      </div>

      <div className="invoice-divider" />

      {/* Customer Details */}
      <div className="customer-section">
        <p className="section-label">Bill To:</p>
        <p className="customer-name">
          {invoice.customerName || "Walk-in Customer"}
        </p>
        {invoice.customerPhone && (
          <p className="customer-detail">Phone: {invoice.customerPhone}</p>
        )}
        {invoice.customerAddress && (
          <p className="customer-detail">{invoice.customerAddress}</p>
        )}
      </div>

      <div className="invoice-divider" />

      {/* Items Table */}
      <table className="items-table">
        <thead>
          <tr>
            <th className="col-sno">#</th>
            <th className="col-desc">Description of Goods</th>
            <th className="col-hsn">HSN/SAC</th>
            <th className="col-qty">Qty</th>
            <th className="col-rate">Rate</th>
            <th className="col-gst">GST%</th>
            <th className="col-amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={i}>
              <td className="col-sno">{i + 1}</td>
              <td className="col-desc">{item.medicineName}</td>
              <td className="col-hsn">{item.hsnCode || "—"}</td>
              <td className="col-qty">
                {item.quantity} {item.unit || "Nos"}
              </td>
              <td className="col-rate">₹{item.rate.toFixed(2)}</td>
              <td className="col-gst">{item.gstRate}%</td>
              <td className="col-amount">₹{item.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-divider" />

      {/* Tax Breakdown */}
      <div className="tax-section">
        <table className="tax-table">
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th>Taxable Value</th>
              <th>CGST Rate</th>
              <th>CGST Amt</th>
              <th>SGST Rate</th>
              <th>SGST Amt</th>
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i}>
                <td>{item.hsnCode || "—"}</td>
                <td>₹{item.amount.toFixed(2)}</td>
                <td>{item.gstRate / 2}%</td>
                <td>₹{item.cgst.toFixed(2)}</td>
                <td>{item.gstRate / 2}%</td>
                <td>₹{item.sgst.toFixed(2)}</td>
                <td>₹{item.gstAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={1}>
                <strong>Total</strong>
              </td>
              <td>
                <strong>₹{invoice.subtotal.toFixed(2)}</strong>
              </td>
              <td></td>
              <td>
                <strong>₹{invoice.cgst.toFixed(2)}</strong>
              </td>
              <td></td>
              <td>
                <strong>₹{invoice.sgst.toFixed(2)}</strong>
              </td>
              <td>
                <strong>₹{invoice.totalGst.toFixed(2)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="invoice-divider" />

      {/* Totals */}
      <div className="totals-section">
        <div className="totals-left">
          <p className="amount-in-words">
            <span className="meta-label">Amount in Words:</span>{" "}
            {numberToWords(invoice.grandTotal)}
          </p>
        </div>
        <div className="totals-right">
          <div className="total-row">
            <span>Subtotal</span>
            <span>₹{invoice.subtotal.toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>CGST</span>
            <span>₹{invoice.cgst.toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>SGST</span>
            <span>₹{invoice.sgst.toFixed(2)}</span>
          </div>
          {invoice.discount ? (
            <div className="total-row discount">
              <span>Discount</span>
              <span>-₹{invoice.discount.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="total-row grand-total">
            <span>Grand Total</span>
            <span>₹{invoice.grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="invoice-divider" />

      {/* Footer */}
      <div className="invoice-footer">
        <div className="footer-left">
          {invoice.notes && (
            <div className="notes-section">
              <p className="meta-label">Notes:</p>
              <p>{invoice.notes}</p>
            </div>
          )}
          <p className="terms">
            Terms: Goods once sold will not be taken back. Subject to local
            jurisdiction.
          </p>
          <p className="digital-stamp">
            This is a computer-generated invoice.
          </p>
        </div>
        <div className="footer-right">
          <p className="meta-label">Authorised Signatory</p>
          <div className="signature-space" />
          <p className="signature-label">For {shopName}</p>
        </div>
      </div>
    </div>
  );
}

export function PrintContainer({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="print-container-overlay">
      <div className="print-toolbar">
        <button
          onClick={() => window.print()}
          className="print-action-btn print-btn-primary"
        >
          🖨️ Print
        </button>
        <button onClick={onClose} className="print-action-btn print-btn-secondary">
          ✕ Close
        </button>
      </div>
      <div className="print-container">{children}</div>
    </div>
  );
}
