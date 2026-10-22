import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export const BARCODE_FORMATS = [
  { value: "CODE128", label: "Code 128 (lettres et chiffres, le plus courant)" },
  { value: "EAN13", label: "EAN-13" },
  { value: "EAN8", label: "EAN-8" },
  { value: "UPC", label: "UPC" },
  { value: "CODE39", label: "Code 39 (lettres et chiffres)" },
  { value: "ITF", label: "ITF" },
];

// large : affichage en caisse, le code occupe toute la largeur de l'écran
export function Barcode({ value, format, large }: { value: string; format?: string | null; large?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: format || "CODE128",
        displayValue: true,
        font: "Nunito",
        fontSize: large ? 22 : 18,
        margin: large ? 0 : 12,
        height: large ? 160 : 110,
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [value, format, large]);

  return (
    <div className="flex flex-col items-center">
      <svg ref={ref} className={error ? "hidden" : large ? "h-auto w-full" : "h-auto max-w-full"} />
      {error && <p className="text-sm text-rose-deep">Ce code n'est pas valide pour ce format.</p>}
    </div>
  );
}

export function QrCode({ value, large }: { value: string; large?: boolean }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 2, width: 600 }).then(setSrc, () => setSrc(undefined));
  }, [value]);
  return src ? <img src={src} alt="QR code" className={`mx-auto max-w-full [image-rendering:pixelated] ${large ? "w-full sm:w-96" : "w-64"}`} /> : null;
}
