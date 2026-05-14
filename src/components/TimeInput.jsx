export default function TimeInput({ value, onChange, color }) {
  return (
    <input
      type="time"
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${color}33`, borderRadius:6, padding:"4px 6px", color:value ? color : "#334155", fontSize:12, fontFamily:"monospace", outline:"none", width:90 }}
    />
  );
}
