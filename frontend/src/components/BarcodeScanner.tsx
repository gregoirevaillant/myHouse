import { useEffect, useRef, useState } from "react";

// caméra arrière + lecture continue ; chargé à la demande pour ne pas alourdir l'app
export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("@zxing/browser")
      .then(({ BrowserMultiFormatReader }) =>
        new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video.current!, (result, _err, controls) => {
          if (!result || cancelled) return;
          controls.stop();
          onCode(result.getText());
        }),
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      })
      .catch(() => setError("Caméra inaccessible : autorise-la dans les réglages de l'iPhone"));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onCode]);

  return (
    <div className="space-y-2">
      <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-2xl bg-ink object-cover" />
      {error && <p className="text-sm font-bold text-rose-deep">{error}</p>}
      <button type="button" className="btn-ghost w-full" onClick={onClose}>
        Annuler
      </button>
    </div>
  );
}
