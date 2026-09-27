import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef } from "react";

interface BarcodeCameraScannerProps {
  /** When true, the camera stream is started and the scanner view is rendered. */
  active: boolean;
  /** Called with the decoded barcode text. The scanner is stopped before this fires. */
  onScan: (code: string) => void;
  /** Called when the camera cannot be started. */
  onError?: (message: string) => void;
  /** Extra classes applied to the scanner container div. */
  className?: string;
}

/**
 * Reusable live barcode/QR scanner built on html5-qrcode.
 * Renders nothing until `active` is true; stops the camera and cleans up on
 * unmount or when `active` flips false.
 */
export function BarcodeCameraScanner({
  active,
  onScan,
  onError,
  className,
}: BarcodeCameraScannerProps) {
  const idRef = useRef(
    `barcode-reader-${Math.random().toString(36).slice(2, 9)}`,
  );
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const scanner = new Html5Qrcode(idRef.current);
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 160 } },
        (decodedText) => {
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {});
          if (cancelled) return;
          onScanRef.current(decodedText);
        },
        () => {},
      )
      .catch(() => {
        if (cancelled) return;
        onErrorRef.current?.(
          "Camera access denied or not available on this device",
        );
      });
    return () => {
      cancelled = true;
      try {
        void scanner.stop().catch(() => {});
      } catch {
        // ignore
      }
    };
  }, [active]);

  if (!active) return null;
  return <div id={idRef.current} className={className} />;
}

export default BarcodeCameraScanner;
