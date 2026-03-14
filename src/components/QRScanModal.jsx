/* ================================================================
   QRScanModal — Quick-pay modal from bottom nav QR button
   - Chi tiêu tự do (không cần task) hoặc gắn vào task
   - Tiền mặt / chuyển khoản / ví điện tử
   - QR chỉ hiện khi chọn nguồn bank
   - Lưu: gắn task → patch task expense, tự do → tạo task mới loại expense
   ================================================================ */
import { useState, useRef } from "react";
import jsQR from "jsqr";
import { C, EXPENSE_CATEGORIES, PAYMENT_SOURCES, fmtMoney } from "../constants";

export default function QRScanModal({ tasks, patchTask, addExpense, onClose }) {
  const [step, setStep] = useState("form"); // form | qr
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTask, setSelectedTask] = useState(""); // "" = chi tiêu tự do
  const [category, setCategory] = useState("personal");
  const [source, setSource] = useState("cash");
  const [billPhoto, setBillPhoto] = useState(null);
  const [qrResult, setQrResult] = useState(null);
  const fileRef = useRef(null);

  const activeTasks = tasks.filter(t => t.status !== "done" && !t.deleted);
  const isBank = source && source !== "cash" && source !== "momo" && source !== "zalopay";

  // Parse VietQR / bank transfer QR data
  const parseQR = (data) => {
    if (!data) return null;
    try {
      // VietQR format: contains bank info, account, amount
      const amtMatch = data.match(/amount[=:](\d+)/i) || data.match(/(\d{4,})/);
      const descMatch = data.match(/addInfo[=:]([^&]+)/i) || data.match(/purpose[=:]([^&]+)/i);
      return {
        raw: data,
        amount: amtMatch ? amtMatch[1] : null,
        description: descMatch ? decodeURIComponent(descMatch[1]) : null,
      };
    } catch { return { raw: data }; }
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 800;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        setBillPhoto(canvas.toDataURL("image/jpeg", 0.7));

        // Try to decode QR code from image
        try {
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h);
          if (code?.data) {
            const parsed = parseQR(code.data);
            setQrResult(parsed);
            if (parsed?.amount && !amount) setAmount(parsed.amount);
            if (parsed?.description && !description) setDescription(parsed.description);
          }
        } catch {}
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const qrUrl = (() => {
    if (!amount || !isBank) return null;
    const desc = encodeURIComponent(
      description || (selectedTask ? (activeTasks.find(t => t.id === Number(selectedTask))?.title?.slice(0, 25) || "Thanh toan") : "Chi tieu")
    );
    const bankCode = source?.replace("bank_", "") || "970436";
    return `https://img.vietqr.io/image/${bankCode}-0-compact2.png?amount=${amount}&addInfo=${desc}`;
  })();

  const handleConfirm = () => {
    if (!amount) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return;

    const taskTitle = selectedTask ? (activeTasks.find(t => t.id === Number(selectedTask))?.title || "") : "";
    const expenseItem = {
      amount: amt,
      date: new Date().toISOString().slice(0, 10),
      category,
      source: source || "cash",
      paid: true,
      description: description || "",
      taskId: selectedTask ? Number(selectedTask) : null,
      taskTitle,
      billPhoto: billPhoto || null,
    };

    // Luôn lưu vào danh mục chi tiêu riêng
    addExpense?.(expenseItem);

    // Nếu gắn task → cũng cập nhật expense trong task
    if (selectedTask) {
      const taskId = Number(selectedTask);
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const updates = { expense: { ...(task.expense || {}), amount: amt, date: expenseItem.date, category, source: source || "cash", paid: true } };
        if (billPhoto) {
          updates.billPhotos = [...(task.billPhotos || []), { id: Date.now(), data: billPhoto, ts: new Date().toISOString() }];
        }
        patchTask(taskId, updates);
      }
    }
    onClose();
  };

  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
        background: C.surface, borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 30px rgba(0,0,0,.15)", animation: "slideUp .25s ease-out",
      }}>
        {/* Handle bar */}
        <div style={{ textAlign: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 3, background: C.border, borderRadius: 2, display: "inline-block" }} />
        </div>

        <div style={{ padding: "8px 18px 24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <div style={{ marginRight: 8, display: "flex", alignItems: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2">
                <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="15" y="2" width="7" height="7" rx="1"/><rect x="2" y="15" width="7" height="7" rx="1"/>
                <rect x="4.5" y="4.5" width="2" height="2" fill={C.accent} stroke="none"/><rect x="17.5" y="4.5" width="2" height="2" fill={C.accent} stroke="none"/><rect x="4.5" y="17.5" width="2" height="2" fill={C.accent} stroke="none"/>
                <path d="M15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2zM17 17h2v2h-2z" fill={C.accent} stroke="none"/>
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Chi tiêu nhanh</div>
            <button className="tap" onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22 }}>×</button>
          </div>

          {step === "form" && (
            <>
              {/* Bill photo / QR scan */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>CHỤP / QUÉT QR HÓA ĐƠN</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="tap" onClick={() => { fileRef.current?.setAttribute("capture", "environment"); fileRef.current?.click(); }}
                    style={{ flex: 1, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "10px", fontSize: 12, color: C.sub, textAlign: "center" }}>
                    📷 Chụp ảnh
                  </button>
                  <button className="tap" onClick={() => { fileRef.current?.removeAttribute("capture"); fileRef.current?.click(); }}
                    style={{ flex: 1, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "10px", fontSize: 12, color: C.sub, textAlign: "center" }}>
                    🖼️ Chọn từ thư viện
                  </button>
                  {billPhoto && (
                    <img src={billPhoto} alt="Bill" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                {qrResult && (
                  <div style={{ marginTop: 6, padding: "6px 10px", background: `${C.green}15`, borderRadius: 8, border: `1px solid ${C.green}33`, fontSize: 11, color: C.green }}>
                    ✓ Đã nhận diện QR{qrResult.amount ? ` — ${fmtMoney(Number(qrResult.amount))}` : ""}
                  </div>
                )}
                {billPhoto && !qrResult && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>📷 Đã chụp hóa đơn (không phát hiện QR)</div>
                )}
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>SỐ TIỀN (VNĐ)</div>
                <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="150000"
                  style={{ width: "100%", fontSize: 18, fontWeight: 700, color: C.gold, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", outline: "none", background: C.bg, boxSizing: "border-box" }} />
              </div>

              {/* Description — preset reasons + custom */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>LÝ DO CHI TIÊU</div>
                <div className="no-scrollbar" style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 6 }}>
                  {["Ăn uống","Xăng xe","Vật liệu","Tiếp khách","Lương/Công","Vận chuyển","Điện/Nước","Internet","Thuê mặt bằng","Sửa chữa","Mua sắm","Y tế"].map(r => (
                    <button key={r} className="tap" onClick={() => setDescription(description === r ? "" : r)}
                      style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
                        background: description === r ? C.accent + "20" : C.bg,
                        color: description === r ? C.accent : C.muted,
                        border: `1px solid ${description === r ? C.accent + "66" : C.border}` }}>
                      {r}
                    </button>
                  ))}
                </div>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Hoặc nhập lý do khác..."
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Task selector — optional */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>LIÊN KẾT CÔNG VIỆC <span style={{ fontWeight: 400 }}>(không bắt buộc)</span></div>
                <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)}
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }}>
                  <option value="">Chi tiêu tự do</option>
                  {activeTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>LOẠI CHI</div>
                <div className="no-scrollbar" style={{ display: "flex", gap: 4, overflowX: "auto" }}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <button key={k} className="tap" onClick={() => setCategory(k)}
                      style={{ display: "flex", alignItems: "center", gap: 3, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0,
                        background: category === k ? v.color + "20" : C.bg,
                        color: category === k ? v.color : C.muted,
                        border: `1px solid ${category === k ? v.color + "66" : C.border}` }}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment source */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>NGUỒN THANH TOÁN</div>
                <select value={source} onChange={e => setSource(e.target.value)}
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }}>
                  {Object.entries(PAYMENT_SOURCES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                {amount && isBank && (
                  <button className="tap" onClick={() => setStep("qr")}
                    style={{ flex: 1, background: `linear-gradient(135deg,${C.accent},${C.purple})`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    ⎚ QR thanh toán
                  </button>
                )}
                {amount && (
                  <button className="tap" onClick={handleConfirm}
                    style={{ flex: 1, background: C.green, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 700 }}>
                    ✓ Lưu {!selectedTask ? "(tự do)" : ""}
                  </button>
                )}
              </div>
            </>
          )}

          {step === "qr" && (
            <>
              {/* QR Display */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: C.sub, marginBottom: 8 }}>
                  Quét mã QR để thanh toán <span style={{ fontWeight: 700, color: C.gold }}>{fmtMoney(Number(amount))}</span>
                </div>
                {qrUrl && (
                  <img src={qrUrl} alt="QR Code" style={{ width: 240, height: 240, borderRadius: 12, border: `2px solid ${C.border}` }}
                    onError={e => { e.target.style.display = "none"; }} />
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="tap" onClick={() => setStep("form")}
                  style={{ flex: 1, background: C.card, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px", fontSize: 14 }}>
                  ← Quay lại
                </button>
                <button className="tap" onClick={handleConfirm}
                  style={{ flex: 1, background: C.green, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 700 }}>
                  ✓ Đã thanh toán & Lưu
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
