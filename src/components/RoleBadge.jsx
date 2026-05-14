import { ROLE_COLORS, ROLE_LABELS } from "../constants/index.js";

export default function RoleBadge({ role, small }) {
  const c = ROLE_COLORS[role] || "#94a3b8";
  return (
    <span style={{ display:"inline-block", background:c+"22", border:`1px solid ${c}55`, color:c, borderRadius:4, padding:small?"1px 5px":"2px 8px", fontSize:small?8:10, fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase" }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}
