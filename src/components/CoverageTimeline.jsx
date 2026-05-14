import { CLINIC_OPEN, CLINIC_SPAN, ROLE_COLORS } from "../constants/index.js";
import { fromMin } from "../utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "../utils/coverage.js";

export default function CoverageTimeline({ dayOfWeek, employees, vacations, dayStr, compact }) {
  const slots  = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);
  const gaps   = getCoverageGaps(slots);
  const hasGap = gaps.length > 0;

  const W     = compact ? 120 : 320;
  const ratio = W / CLINIC_SPAN;

  const ticks = [];
  for (let t = CLINIC_OPEN; t <= CLINIC_CLOSE; t += 120) ticks.push(t);

  if (compact) {
    return (
      <div style={{ position:"relative", height:6, background:"rgba(255,255,255,0.04)", borderRadius:3, overflow:"hidden" }}>
        {slots.map(s => {
          const x = (s.startMin - CLINIC_OPEN) * ratio;
          const w = (s.endMin - s.startMin) * ratio;
          const c = ROLE_COLORS[s.role] || "#94a3b8";
          return <div key={s.empId} style={{ position:"absolute", top:0, left:x, width:w, height:"100%", background:c+"88", borderRadius:1 }} />;
        })}
        {gaps.map((g, i) => {
          const x = (g.startMin - CLINIC_OPEN) * ratio;
          const w = (g.endMin - g.startMin) * ratio;
          return <div key={i} style={{ position:"absolute", top:0, left:x, width:Math.max(w, 2), height:"100%", background:"rgba(239,68,68,0.7)", borderRadius:1 }} />;
        })}
      </div>
    );
  }

  return (
    <div>
      <div style={{ position:"relative", height:14, marginBottom:2 }}>
        {ticks.map(t => (
          <div key={t} style={{ position:"absolute", left:(t - CLINIC_OPEN) * ratio, fontSize:7, color:"#334155", fontFamily:"monospace", transform:"translateX(-50%)" }}>
            {fromMin(t)}
          </div>
        ))}
      </div>

      <div style={{ position:"relative", background:"rgba(255,255,255,0.04)", borderRadius:6, overflow:"visible", marginBottom:4 }}>
        {ticks.map(t => (
          <div key={t} style={{ position:"absolute", left:(t - CLINIC_OPEN) * ratio, top:0, bottom:0, width:1, background:"rgba(255,255,255,0.04)" }} />
        ))}

        {slots.length === 0 ? (
          <div style={{ height:8, background:"rgba(239,68,68,0.15)", borderRadius:4 }} />
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"3px 0" }}>
            {slots.map(s => {
              const x = (s.startMin - CLINIC_OPEN) * ratio;
              const w = (s.endMin - s.startMin) * ratio;
              const c = ROLE_COLORS[s.role] || "#94a3b8";
              return (
                <div key={s.empId} style={{ position:"relative", height:14, background:"rgba(255,255,255,0.02)", borderRadius:3 }}>
                  <div
                    title={`${s.name}: ${fromMin(s.startMin)}–${fromMin(s.endMin)}`}
                    style={{ position:"absolute", left:x, width:Math.max(w, 4), height:"100%", background:`linear-gradient(90deg,${c}55,${c}88)`, border:`1px solid ${c}44`, borderRadius:3, display:"flex", alignItems:"center", overflow:"hidden" }}
                  >
                    <span style={{ fontSize:7, color:c, fontFamily:"monospace", paddingLeft:3, whiteSpace:"nowrap", overflow:"hidden" }}>
                      {s.name.split(" ")[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {gaps.map((g, i) => {
          const x = (g.startMin - CLINIC_OPEN) * ratio;
          const w = (g.endMin - g.startMin) * ratio;
          return (
            <div key={i} title={`Sin vet: ${fromMin(g.startMin)}–${fromMin(g.endMin)}`} style={{ position:"absolute", left:x, top:0, bottom:0, width:Math.max(w, 3), background:"rgba(239,68,68,0.12)", borderLeft:"2px solid rgba(239,68,68,0.5)", borderRight:w > 3 ? "2px solid rgba(239,68,68,0.5)" : undefined, pointerEvents:"none" }} />
          );
        })}
      </div>

      {hasGap && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {gaps.map((g, i) => (
            <span key={i} style={{ fontSize:9, color:"#f87171", fontFamily:"monospace", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, padding:"1px 5px" }}>
              ⚠ {fromMin(g.startMin)}–{fromMin(g.endMin)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
