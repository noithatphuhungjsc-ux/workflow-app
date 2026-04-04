/* OrgChartTab — Sơ đồ tổ chức */
import { C, TEAM_ACCOUNTS } from "../../constants";
import { Section } from "./SettingsHelpers";

function OrgCard({ person, isDirector }) {
  return (
    <div style={{
      background: C.card,
      border: `1.5px solid ${isDirector ? person.color : C.border}`,
      borderRadius: 14,
      padding: "12px 16px",
      textAlign: "center",
      minWidth: isDirector ? 140 : 70,
      boxShadow: isDirector ? `0 2px 8px ${person.color}22` : "none",
    }}>
      <div style={{
        width: isDirector ? 40 : 32,
        height: isDirector ? 40 : 32,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${person.color}, ${person.color}88)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 700, fontSize: isDirector ? 16 : 13,
        margin: "0 auto 8px",
      }}>
        {person.name.charAt(0)}
      </div>
      <div style={{ fontSize: isDirector ? 14 : 12, fontWeight: 700, color: C.text }}>{person.name.split(" ").pop()}</div>
      <div style={{ fontSize: 11, color: person.color, fontWeight: 600 }}>{person.title}</div>
    </div>
  );
}

function OrgChart() {
  const accounts = TEAM_ACCOUNTS;
  const director = accounts.find(a => a.role === "director");
  const staff = accounts.filter(a => a.role !== "director");

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Director at top */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <OrgCard person={director} isDirector />
      </div>
      {/* Connector line */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <div style={{ width: 2, height: 24, background: C.border }} />
      </div>
      {/* Horizontal line connecting to all staff */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <div style={{ width: "80%", height: 2, background: C.border }} />
      </div>
      {/* Staff row */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${staff.length}, 1fr)`, gap: 8 }}>
        {staff.map(s => (
          <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 2, height: 16, background: C.border, marginBottom: 8 }} />
            <OrgCard person={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrgChartTab() {
  return (
    <>
      <Section title="Sơ đồ tổ chức" />
      <OrgChart />
    </>
  );
}
