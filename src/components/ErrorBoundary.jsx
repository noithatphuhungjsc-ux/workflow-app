import { Component } from "react";
import { C } from "../constants";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = String(this.state.error?.message || this.state.error || "Unknown error");
    const truncated = msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
    const mailBody = encodeURIComponent(`Lỗi ứng dụng WorkFlow:\n\n${msg}\n\nStack:\n${this.state.error?.stack || "N/A"}`);

    return (
      <div style={{
        minHeight: "100dvh", background: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          background: C.surface, borderRadius: 16, padding: 32,
          maxWidth: 420, width: "100%", textAlign: "center",
          boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: C.red, margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
            Ứng dụng gặp sự cố
          </h2>
          <p style={{ color: C.sub, fontSize: 14, margin: "0 0 20px" }}>
            Đã xảy ra lỗi không mong muốn. Vui lòng thử tải lại trang.
          </p>
          <div style={{
            background: C.redD, borderRadius: 8, padding: "10px 14px",
            marginBottom: 24, textAlign: "left",
          }}>
            <code style={{ color: C.red, fontSize: 12, wordBreak: "break-word" }}>
              {truncated}
            </code>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: C.red, color: "#fff", border: "none",
                borderRadius: 10, padding: "10px 24px", fontSize: 15,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Tải lại
            </button>
            <a
              href={`mailto:trinh@workflow.vn?subject=${encodeURIComponent("Báo lỗi WorkFlow")}&body=${mailBody}`}
              style={{
                background: C.bg, color: C.text, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "10px 24px", fontSize: 15,
                fontWeight: 600, cursor: "pointer", textDecoration: "none",
                display: "inline-flex", alignItems: "center",
              }}
            >
              Báo lỗi
            </a>
          </div>
        </div>
      </div>
    );
  }
}
