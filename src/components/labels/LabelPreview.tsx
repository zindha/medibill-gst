import type { LabelData, LabelTemplate } from "@/lib/api";
import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

const BARCODE_OPTS = {
  width: 1.2,
  height: 24,
  fontSize: 10,
  margin: 0,
} as const;

/**
 * Renders a barcode into an <svg> with JsBarcode. Pure-digit EAN-13 strings try
 * the EAN13 symbology first (checksum enforced); anything else — or a failed
 * EAN13 render — falls back to CODE128, which encodes arbitrary alphanumeric
 * values. If both fail the svg is left empty rather than showing an error glyph.
 */
export function LabelBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !value) return;

    const render = (format: "EAN13" | "CODE128"): boolean => {
      let valid = true;
      try {
        JsBarcode(svg, value, {
          ...BARCODE_OPTS,
          format,
          valid: (v: boolean) => {
            valid = v;
          },
        });
      } catch {
        valid = false;
      }
      if (!valid) svg.innerHTML = "";
      return valid;
    };

    if (!/^\d{13}$/.test(value) || !render("EAN13")) {
      render("CODE128");
    }
  }, [value]);

  return <svg ref={svgRef} className="label-barcode" role="img" aria-label={`Barcode ${value}`} />;
}

function formatMrp(mrp: number): string {
  return `MRP ₹${Number.isInteger(mrp) ? mrp : mrp.toFixed(2)}`;
}

function LabelCard({ label, template }: { label: LabelData; template: LabelTemplate }) {
  const batchLine = [label.batchNo, label.expiry].filter(Boolean).join(" · ");
  const identity = [label.brand, label.pack].filter(Boolean).join(" · ");

  return (
    <div
      className="label-card"
      style={{ width: `${template.widthMm}mm`, height: `${template.heightMm}mm` }}
    >
      <div className="label-card-head">
        {label.storeName && <p className="label-store">{label.storeName}</p>}
        <p className="label-name" title={label.fullName}>
          {label.name}
        </p>
        {identity && <p className="label-meta">{identity}</p>}
      </div>

      {batchLine && <p className="label-batch">{batchLine}</p>}

      <div className="label-card-foot">{label.mrp != null && <span className="label-mrp">{formatMrp(label.mrp)}</span>}</div>

      {label.barcode ? (
        <LabelBarcode value={label.barcode} />
      ) : (
        <p className="label-nobarcode">No barcode</p>
      )}
    </div>
  );
}

/**
 * A print-ready sheet: a CSS grid laid out at true millimetre sizes using the
 * template's A4 geometry (gridTemplateColumns = cols x widthMm, 2mm gutters).
 * Printing is handled by the `.label-sheet` print rules in src/index.css.
 */
export function LabelSheet({ template, labels }: { template: LabelTemplate; labels: LabelData[] }) {
  return (
    <div
      className="label-sheet"
      data-template={template.id}
      style={{ gridTemplateColumns: `repeat(${template.cols}, ${template.widthMm}mm)` }}
    >
      {labels.map((label, index) => (
        <LabelCard key={index} label={label} template={template} />
      ))}
    </div>
  );
}
