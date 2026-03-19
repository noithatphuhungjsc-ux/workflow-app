/* ================================================================
   SITE MANAGER — Director manages work sites (geofence locations)
   ================================================================ */
import { useState } from "react";
import { C } from "../../constants";
import { getCurrentPosition } from "../../services/attendanceService";

export default function SiteManager({ sites, onAdd, onEdit, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "", radius_meters: 200 });
  const [gettingLocation, setGettingLocation] = useState(false);

  const resetForm = () => {
    setForm({ name: "", address: "", lat: "", lng: "", radius_meters: 200 });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (site) => {
    setForm({
      name: site.name || "",
      address: site.address || "",
      lat: site.lat || "",
      lng: site.lng || "",
      radius_meters: site.radius_meters || 200,
    });
    setEditId(site.id);
    setShowForm(true);
  };

  const handleGetCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const pos = await getCurrentPosition();
      setForm(f => ({ ...f, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
    } catch (e) {
      alert(e.message);
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert("Nhap ten dia diem");
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      radius_meters: parseInt(form.radius_meters) || 200,
    };
    try {
      if (editId) await onEdit(editId, payload);
      else await onAdd(payload);
      resetForm();
    } catch (e) {
      alert("Loi: " + e.message);
    }
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Dia diem lam viec</span>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          + Them
        </button>
      </div>

      {/* Site list */}
      {(!sites || sites.length === 0) && (
        <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: 20 }}>Chua co dia diem nao</div>
      )}
      {(sites || []).map((site) => (
        <div key={site.id} className="card" style={{ padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{site.name}</div>
            {site.address && <div style={{ fontSize: 11, color: C.muted }}>{site.address}</div>}
            <div style={{ fontSize: 10, color: C.muted }}>
              {site.lat && site.lng ? `${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}` : "Chua co toa do"}
              {" — R: "}{site.radius_meters || 200}m
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => handleEdit(site)}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", color: C.accent, fontSize: 11, cursor: "pointer" }}>
              Sua
            </button>
            <button onClick={() => { if (confirm("Xoa dia diem nay?")) onDelete(site.id); }}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", color: "#e74c3c", fontSize: 11, cursor: "pointer" }}>
              Xoa
            </button>
          </div>
        </div>
      ))}

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>
              {editId ? "Sua dia diem" : "Them dia diem"}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Ten dia diem *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Van phong chinh"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Dia chi</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="VD: 123 Nguyen Hue, Q1"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Latitude</label>
                <input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} type="number" step="any"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Longitude</label>
                <input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} type="number" step="any"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <button onClick={handleGetCurrentLocation} disabled={gettingLocation}
              style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
              {gettingLocation ? "Dang lay vi tri..." : "📍 Lay vi tri hien tai"}
            </button>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Ban kinh (m)</label>
              <input value={form.radius_meters} onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} type="number"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={resetForm}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Huy
              </button>
              <button onClick={handleSave}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {editId ? "Cap nhat" : "Them"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
