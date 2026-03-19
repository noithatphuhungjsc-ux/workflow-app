/* ================================================================
   CHECK-IN FLOW — Step-by-step wizard: GPS → Selfie → Confirm
   ================================================================ */
import { useState, useRef, useCallback, useEffect } from "react";
import { C } from "../../constants";
import { getCurrentPosition, captureSelfie, checkGeofence } from "../../services/attendanceService";

const STEPS = ["gps", "selfie", "confirm"];

export default function CheckInFlow({ type, sites, onSubmit, onCancel, settings }) {
  const [step, setStep] = useState(0);
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [selfieBlob, setSelfieBlob] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieError, setSelfieError] = useState(null);
  const [nearestSite, setNearestSite] = useState(null);
  const [geofenceResult, setGeofenceResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const requireGPS = settings?.attendanceRequireGPS !== false;
  const requireSelfie = settings?.attendanceRequireSelfie !== false;

  // Auto-start GPS on mount
  useEffect(() => {
    if (requireGPS) handleGetGPS();
    else setStep(requireSelfie ? 1 : 2);
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── Step 1: GPS ──
  const handleGetGPS = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await getCurrentPosition();
      setGps(pos);
      // Find nearest site
      if (sites?.length) {
        let nearest = null;
        let minDist = Infinity;
        for (const site of sites) {
          const result = checkGeofence(pos.lat, pos.lng, site);
          if (result.distance !== null && result.distance < minDist) {
            minDist = result.distance;
            nearest = { site, ...result };
          }
        }
        setNearestSite(nearest);
        setGeofenceResult(nearest);
      }
      setStep(requireSelfie ? 1 : 2);
    } catch (e) {
      setGpsError(e.message);
    } finally {
      setGpsLoading(false);
    }
  }, [sites, requireSelfie]);

  // ── Step 2: Selfie ──
  const startCamera = useCallback(async () => {
    setSelfieError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e) {
      setSelfieError("Không thể mở camera: " + e.message);
    }
  }, []);

  useEffect(() => {
    if (step === 1 && requireSelfie) startCamera();
  }, [step, requireSelfie, startCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      setSelfieBlob(blob);
      setSelfiePreview(URL.createObjectURL(blob));
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setStep(2);
    }, "image/jpeg", 0.7);
  }, []);

  // ── Step 3: Confirm & Submit ──
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await onSubmit({
        lat: gps?.lat,
        lng: gps?.lng,
        accuracy: gps?.accuracy,
        siteId: nearestSite?.site?.id || null,
        selfieBlob,
        verificationMethod: "gps",
        geofenceResult,
      });
    } catch (e) {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  }, [gps, nearestSite, selfieBlob, geofenceResult, onSubmit]);

  const isCheckIn = type === "check_in";
  const title = isCheckIn ? "Cham cong VAO" : "Cham cong RA";
  const color = isCheckIn ? C.green : "#e74c3c";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 20, width: "100%", maxWidth: 400, maxHeight: "90vh", overflow: "auto", padding: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{title}</span>
          <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 22, color: C.muted, cursor: "pointer" }}>&times;</button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? color : C.border }} />
          ))}
        </div>

        {/* Step 1: GPS */}
        {step === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>Xac dinh vi tri</div>
            {gpsLoading && <div style={{ color: C.muted, fontSize: 13 }}>Dang lay vi tri GPS...</div>}
            {gpsError && (
              <div>
                <div style={{ color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>{gpsError}</div>
                <button onClick={handleGetGPS} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: color, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Thu lai
                </button>
              </div>
            )}
            {gps && (
              <div>
                <div style={{ color: C.green, fontSize: 13, marginBottom: 4 }}>Da xac dinh vi tri</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (±{Math.round(gps.accuracy)}m)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Selfie */}
        {step === 1 && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>Chup anh xac nhan</div>
            {selfieError && <div style={{ color: "#e74c3c", fontSize: 13, marginBottom: 8 }}>{selfieError}</div>}
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#000", marginBottom: 12 }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: 300, objectFit: "cover" }} />
            </div>
            <button onClick={handleCapture} style={{
              padding: "14px 32px", borderRadius: 50, border: "none",
              background: color, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              📸 Chup
            </button>
            {!requireSelfie && (
              <button onClick={() => setStep(2)} style={{
                display: "block", margin: "8px auto 0", background: "none", border: "none",
                color: C.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline",
              }}>
                Bo qua
              </button>
            )}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 2 && (
          <div style={{ padding: "10px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16, textAlign: "center" }}>Xac nhan cham cong</div>

            {/* Summary */}
            <div style={{ background: C.bg, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              {gps && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span>📍</span>
                  <div>
                    <div style={{ fontSize: 13, color: C.text }}>Vi tri: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</div>
                    {geofenceResult && (
                      <div style={{ fontSize: 11, color: geofenceResult.within ? C.green : "#e67e22" }}>
                        {geofenceResult.within
                          ? `Trong pham vi ${geofenceResult.site?.name} (${geofenceResult.distance}m)`
                          : `Ngoai pham vi ${geofenceResult.site?.name} (${geofenceResult.distance}m)`}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selfiePreview && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📸</span>
                  <img src={selfiePreview} alt="Selfie" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                  <span style={{ fontSize: 13, color: C.green }}>Da chup anh</span>
                </div>
              )}
              {!gps && !selfiePreview && (
                <div style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>
                  Cham cong khong GPS / selfie
                </div>
              )}
            </div>

            {/* Geofence warning */}
            {geofenceResult && !geofenceResult.within && (
              <div style={{ background: "#fff3e0", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 13, color: "#e65100" }}>
                ⚠️ Ban dang o ngoai pham vi dia diem lam viec ({geofenceResult.distance}m). Cham cong van duoc ghi nhan nhung se danh dau "ngoai vung".
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={submitting} style={{
              width: "100%", padding: "16px 0", borderRadius: 14, border: "none",
              background: submitting ? C.border : color, color: submitting ? C.muted : "#fff",
              fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer",
            }}>
              {submitting ? "Dang xu ly..." : `Xac nhan ${isCheckIn ? "VAO" : "RA"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
