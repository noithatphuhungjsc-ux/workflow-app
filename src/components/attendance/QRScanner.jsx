/* ================================================================
   QR SCANNER — Scan QR code for attendance verification
   Uses html5-qrcode library (lazy loaded)
   ================================================================ */
import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../../constants";

export default function QRScanner({ onScan, onClose }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  const startScanner = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      // Dynamically import html5-qrcode
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setResult(decodedText);
          scanner.stop().catch(() => {});
          setScanning(false);
          onScan?.(decodedText);
        },
        () => {} // ignore scan failures
      );
    } catch (e) {
      setError("Khong the mo camera: " + e.message);
      setScanning(false);
    }
  }, [onScan]);

  useEffect(() => {
    startScanner();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 20, width: "100%", maxWidth: 360, padding: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Quet ma QR</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: C.muted, cursor: "pointer" }}>&times;</button>
        </div>

        <div id="qr-reader" ref={containerRef} style={{ width: "100%", borderRadius: 12, overflow: "hidden", marginBottom: 12 }} />

        {error && (
          <div style={{ color: "#e74c3c", fontSize: 13, marginBottom: 8 }}>{error}</div>
        )}

        {result && (
          <div style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>Da quet thanh cong!</div>
        )}

        {!scanning && !result && (
          <button onClick={startScanner}
            style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Quet lai
          </button>
        )}
      </div>
    </div>
  );
}
