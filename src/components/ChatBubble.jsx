import { useState, useRef, useCallback, useMemo } from "react";
import { C } from "../constants";

const StatusIcon = ({ status }) => {
  if (!status) return null;
  if (status === "sending") return <span style={{ fontSize: 9, color: C.muted }}>Đang gửi...</span>;
  if (status === "delivered") return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      <svg width="14" height="10" viewBox="0 0 16 12" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 6 5 10 14 1" />
      </svg>
      <span style={{ fontSize: 9, color: C.muted }}>Đã nhận</span>
    </span>
  );
  if (status === "seen") return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      <svg width="18" height="10" viewBox="0 0 20 12" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 6 5 10 11 1" />
        <polyline points="7 6 11 10 18 1" />
      </svg>
      <span style={{ fontSize: 9, color: C.accent }}>Đã xem</span>
    </span>
  );
  return null;
};

export default function ChatBubble({ message, isMine, senderName, status, isPinned, onDelete, onPin, onReply, allMessages, getName }) {
  const isSystem = message.type === "system";
  const isImage = message.type === "image";
  const isFile = message.type === "file";
  const isLocation = message.type === "location";
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const timerRef = useRef(null);
  const triggeredRef = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });

  const openMenu = useCallback((x, y) => {
    setMenuPos({ x, y });
    setShowMenu(true);
  }, []);

  const startPress = useCallback((e) => {
    const touch = e.touches?.[0];
    if (touch) pressPos.current = { x: touch.clientX, y: touch.clientY };
    triggeredRef.current = false;
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      openMenu(pressPos.current.x, pressPos.current.y);
    }, 500);
  }, [openMenu]);

  const endPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const [galleryIdx, setGalleryIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const allImages = useMemo(() =>
    (allMessages || []).filter(m => m.type === "image" && m.file_url),
    [allMessages]
  );

  const handleImageClick = useCallback(() => {
    if (!triggeredRef.current) {
      const idx = allImages.findIndex(m => m.id === message.id);
      setGalleryIdx(idx >= 0 ? idx : 0);
      setShowPreview(true);
    }
  }, [allImages, message.id]);

  const onGalleryTouchStart = useCallback((e) => {
    e.stopPropagation();
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const onGalleryTouchMove = useCallback((e) => {
    e.stopPropagation();
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    setSwipeOffset(touchDeltaX.current);
  }, []);

  const onGalleryTouchEnd = useCallback((e) => {
    e.stopPropagation();
    const delta = touchDeltaX.current;
    const threshold = 60;
    if (delta < -threshold && galleryIdx < allImages.length - 1) {
      setGalleryIdx(i => i + 1);
    } else if (delta > threshold && galleryIdx > 0) {
      setGalleryIdx(i => i - 1);
    }
    setSwipeOffset(0);
    touchDeltaX.current = 0;
  }, [galleryIdx, allImages.length]);

  if (isSystem) {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>{message.content}</span>
      </div>
    );
  }

  // Parse location data
  let locationData = null;
  if (isLocation) {
    try { locationData = JSON.parse(message.content); } catch {}
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 6, WebkitUserSelect: "none", userSelect: "none" }}
        onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress}
        onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY); }}>
        <div style={{ maxWidth: "75%", minWidth: 40 }}>
          {/* Pin indicator */}
          {isPinned && (
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 3, justifyContent: isMine ? "flex-end" : "flex-start", paddingLeft: isMine ? 0 : 10, paddingRight: isMine ? 10 : 0 }}>
              📌 Đã ghim
            </div>
          )}
          {/* Sender name (group chats only) */}
          {!isMine && senderName && (
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, marginBottom: 2, paddingLeft: 10 }}>
              {senderName}
            </div>
          )}
          {/* Reply quote */}
          {message.reply_to && (() => {
            const orig = allMessages?.find(m => m.id === message.reply_to);
            if (!orig) return null;
            return (
              <div style={{ padding: "6px 10px", marginBottom: 2, borderRadius: 10, background: `${C.accent}10`, borderLeft: `3px solid ${C.accent}`, cursor: "pointer" }}
                onClick={() => { document.getElementById(`msg-${orig.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                <div style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{getName?.(orig.sender_id) || "..."}</div>
                <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {orig.type === "image" ? "📷 Ảnh" : orig.type === "file" ? "📎 Tệp" : orig.content?.slice(0, 60)}
                </div>
              </div>
            );
          })()}
          <div style={{
            background: isImage ? "transparent" : (isMine ? C.accent : C.card),
            color: isMine ? "#fff" : C.text,
            borderRadius: isMine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            padding: isImage ? 0 : "8px 12px",
            border: isImage ? "none" : (isMine ? "none" : `1px solid ${C.border}`),
            boxShadow: isImage ? "none" : "0 1px 3px rgba(0,0,0,.06)",
          }}>
            {isImage && message.file_url ? (
              <img src={message.file_url} alt="" style={{ width: "35vw", maxWidth: 180, borderRadius: 12, display: "block", cursor: "pointer" }}
                onClick={handleImageClick} />
            ) : isFile ? (
              <a href={message.file_url} target="_blank" rel="noopener noreferrer"
                style={{ color: isMine ? "#fff" : C.accent, textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 22 }}>📎</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.file_name || "Tệp đính kèm"}</span>
              </a>
            ) : isLocation && locationData ? (
              <a href={`https://www.google.com/maps?q=${locationData.lat},${locationData.lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: isMine ? "#fff" : C.accent, textDecoration: "none", fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>📍</span>
                  <span style={{ fontWeight: 600 }}>Vị trí</span>
                </div>
                <div style={{
                  width: "100%", height: 120, borderRadius: 10, overflow: "hidden",
                  background: `${C.bg}`,
                }}>
                  <img
                    src={`https://staticmap.openstreetmap.de/staticmap.php?center=${locationData.lat},${locationData.lng}&zoom=15&size=300x150&markers=${locationData.lat},${locationData.lng},red-pushpin`}
                    alt="Map"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <div style={{ fontSize: 11, padding: "4px 0", opacity: 0.8 }}>
                    {locationData.lat.toFixed(5)}, {locationData.lng.toFixed(5)}
                  </div>
                </div>
              </a>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {message.content}
              </div>
            )}
          </div>
          {/* Time + status */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4, marginTop: 2,
            justifyContent: isMine ? "flex-end" : "flex-start",
            paddingLeft: isMine ? 0 : 10, paddingRight: isMine ? 10 : 0,
          }}>
            <span style={{ fontSize: 9, color: C.muted }}>
              {new Date(message.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isMine && status && <StatusIcon status={status} />}
          </div>
        </div>
      </div>

      {/* Image fullscreen gallery */}
      {showPreview && isImage && allImages.length > 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", touchAction: "none" }}
          onClick={() => setShowPreview(false)}>
          {/* Counter */}
          <div style={{ position: "absolute", top: 16, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,.6)", fontSize: 13, fontWeight: 600, zIndex: 2 }}>
            {galleryIdx + 1} / {allImages.length}
          </div>
          {/* Swipeable image area */}
          <div style={{ width: "100vw", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onGalleryTouchStart} onTouchMove={onGalleryTouchMove} onTouchEnd={onGalleryTouchEnd}>
            <img
              src={allImages[galleryIdx]?.file_url}
              alt=""
              style={{
                maxWidth: "92vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8,
                transform: `translateX(${swipeOffset}px)`,
                transition: swipeOffset === 0 ? "transform .3s cubic-bezier(.25,.1,.25,1)" : "none",
                opacity: swipeOffset === 0 ? 1 : Math.max(0.6, 1 - Math.abs(swipeOffset) / 500),
              }}
            />
          </div>
          {/* Nav arrows (desktop) */}
          {galleryIdx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setGalleryIdx(i => i - 1); }}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ‹
            </button>
          )}
          {galleryIdx < allImages.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setGalleryIdx(i => i + 1); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ›
            </button>
          )}
          {/* Bottom buttons */}
          <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
            <button onClick={(e) => { e.stopPropagation(); window.open(allImages[galleryIdx]?.file_url, "_blank"); }}
              style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 20, padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Mở gốc
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowPreview(false); }}
              style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 20, padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Long-press context menu */}
      {showMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500 }} onClick={() => setShowMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "fixed",
            left: Math.min(Math.max(menuPos.x - 75, 8), window.innerWidth - 160),
            top: Math.min(menuPos.y - 10, window.innerHeight - 180),
            background: C.surface, borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,.18)", border: `1px solid ${C.border}`,
            overflow: "hidden", minWidth: 150,
          }}>
            {onReply && (
              <button className="tap" onClick={() => { onReply(); setShowMenu(false); }}
                style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.text, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                ↩️ Trả lời
              </button>
            )}
            <button className="tap" onClick={() => { navigator.clipboard?.writeText(message.content || ""); setShowMenu(false); }}
              style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.text, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              📋 Sao chép
            </button>
            {onPin && (
              <button className="tap" onClick={() => { onPin(message.id); setShowMenu(false); }}
                style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.text, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                📌 {isPinned ? "Bỏ ghim" : "Ghim"}
              </button>
            )}
            {isMine && onDelete && (
              <button className="tap" onClick={() => { onDelete(message.id); setShowMenu(false); }}
                style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.red, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                🗑️ Xóa
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
