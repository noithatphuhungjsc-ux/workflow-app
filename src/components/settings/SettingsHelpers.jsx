/* Shared UI helpers for Settings tabs */
import { C } from "../../constants";

export const IS = { width:"100%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 16px", fontSize:15, color:C.text };

export const Toggle = ({ value, onChange, label, desc }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
    <div style={{ flex:1, marginRight:12 }}>
      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{label}</div>
      {desc && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{desc}</div>}
    </div>
    <div className="tap" onClick={onChange} role="switch" aria-checked={value} aria-label={label}
      style={{ width:48, height:28, borderRadius:14, background: value ? C.green : C.border, position:"relative", cursor:"pointer", transition:"background .2s", flexShrink:0 }}>
      <div style={{ width:22, height:22, borderRadius:11, background:"#fff", position:"absolute", top:3, left: value ? 23 : 3, transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.15)" }} />
    </div>
  </div>
);

export const SelectRow = ({ label, desc, value, onChange, options }) => (
  <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
    <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>{label}</div>
    {desc && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>{desc}</div>}
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      style={{ ...IS, padding:"8px 12px" }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

export const SliderRow = ({ label, desc, value, onChange, min, max, step, unit }) => (
  <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
      <div>
        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:C.accent }}>{value}{unit || ""}</div>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label}
      style={{ width:"100%", accentColor:C.accent }} />
  </div>
);

export const Section = ({ title }) => (
  <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8, marginTop:14, textTransform:"uppercase", letterSpacing:0.5 }}>{title}</div>
);
