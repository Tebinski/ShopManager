import { MONTHS } from "../constants/index.js";
import { getDaysInMonth, getFirstDow, dkey } from "../utils/calendar.js";
import { getWorkingSlots, getCoverageGaps } from "../utils/coverage.js";

export default function YearMini({ year, employees, vacations, today, onNavigate, viewMonth }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:12, padding:"14px 12px" }}>
      <div style={{ fontSize:8, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase", fontFamily:"monospace", textAlign:"center", marginBottom:12 }}>Vista anual · {year}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7 }}>
        {Array.from({ length:12 }, (_, mi) => {
          const dim    = getDaysInMonth(year, mi);
          const fd     = getFirstDow(year, mi);
          const isCur  = mi === viewMonth;
          let vacDays  = 0, gapDays = 0;
          for (let d = 1; d <= dim; d++) {
            const dow = new Date(year, mi, d).getDay();
            const mb  = dow === 0 ? 6 : dow - 1;
            if (mb >= 5) continue;
            const ds = dkey(year, mi, d);
            if (employees.some(e => vacations[e.id]?.[ds])) vacDays++;
            const slots = getWorkingSlots(mb, employees, vacations, ds);
            if (getCoverageGaps(slots).length > 0) gapDays++;
          }
          const cells = [];
          for (let i = 0; i < fd; i++) cells.push(null);
          for (let d = 1; d <= dim; d++) cells.push(d);
          return (
            <div key={mi} onClick={() => onNavigate(mi)} style={{ cursor:"pointer", background:isCur?"rgba(96,165,250,0.08)":"rgba(255,255,255,0.02)", border:`1px solid ${isCur?"rgba(96,165,250,0.2)":"rgba(255,255,255,0.04)"}`, borderRadius:7, padding:"5px 4px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                <span style={{ fontSize:7, color:isCur?"#60a5fa":"#334155", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:1 }}>{MONTHS[mi].slice(0, 3)}</span>
                <div style={{ display:"flex", gap:2 }}>
                  {vacDays > 0 && <span style={{ fontSize:6, color:"#fbbf24" }}>{vacDays}</span>}
                  {gapDays > 0 && <span style={{ fontSize:6, color:"#f87171" }}>⚠{gapDays}</span>}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} style={{ height:4 }} />;
                  const dow    = new Date(year, mi, day).getDay();
                  const mb     = dow === 0 ? 6 : dow - 1;
                  const isW    = mb >= 5;
                  const ds     = dkey(year, mi, day);
                  const hasVac = employees.some(e => vacations[e.id]?.[ds]);
                  const slots  = isW ? [] : getWorkingSlots(mb, employees, vacations, ds);
                  const hasGap = !isW && getCoverageGaps(slots).length > 0;
                  const isT    = year === today.getFullYear() && mi === today.getMonth() && day === today.getDate();
                  return <div key={day} style={{ height:4, borderRadius:1, background:hasGap?"#ef444477":hasVac?"#fbbf2455":isT?"#60a5fa88":isW?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.07)" }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:10, justifyContent:"center" }}>
        {[["#fbbf24","Vacaciones"],["#ef4444","Hueco cobertura"],["#60a5fa","Hoy"]].map(([c, l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <div style={{ width:7, height:4, borderRadius:1, background:c+"88" }} />
            <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
