import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export const BARCODE_FORMATS = [
  { value: "CODE128", label: "Code 128 (le plus courant)" },
  { value: "EAN13", label: "EAN-13" },
  { value: "EAN8", label: "EAN-8" },
  { value: "UPC", label: "UPC" },
  { value: "CODE39", label: "Code 39" },
  { value: "ITF", label: "ITF" },
];

export function Barcode({ value, format }: { value: string; format?: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: format || "CODE128",
        displayValue: true,
        font: "Nunito",
        fontSize: 18,
        margin: 12,
        height: 110,
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [value, format]);

  return (
    <div className="flex flex-col items-center">
      <svg ref={ref} className={error ? "hidden" : "h-auto max-w-full"} />
      {error && <p className="text-sm text-rose-deep">Ce code n'est pas valide pour ce format.</p>}
    </div>
  );
}

export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 2, width: 600 }).then(setSrc, () => setSrc(undefined));
  }, [value]);
  return src ? <img src={src} alt="QR code" className="mx-auto w-64 max-w-full [image-rendering:pixelated]" /> : null;
}
