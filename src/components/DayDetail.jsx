import { MONTHS, CLINIC_OPEN, CLINIC_CLOSE } from "../constants/index.js";
import { parseDkey } from "../utils/calendar.js";
import { fromMin } from "../utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "../utils/coverage.js";
import Modal from "./Modal.jsx";
import RoleBadge from "./RoleBadge.jsx";
import CoverageTimeline from "./CoverageTimeline.jsx";

export default function DayDetail({ dayStr, dayOfWeek, employees, vacations, onClose, clinicOpen = CLINIC_OPEN, clinicClose = CLINIC_CLOSE, dayAssignment, onAssign }) {
  const base  = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);
  const assignedEmp = dayAssignment ? employees.find(e => e.id === dayAssignment) : null;
  const slots = assignedEmp && !vacations[dayAssignment]?.[dayStr] && !base.some(s => s.empId === dayAssignment)
    ? [...base, { empId: dayAssignment, name: assignedEmp.name, role: assignedEmp.role, startMin: clinicOpen, endMin: clinicClose }]
    : base;
  const gaps  = getCoverageGaps(slots, clinicOpen, clinicClose);
  const { y, m, d } = parseDkey(dayStr);
  const label = `${d} de ${MONTHS[m]} de ${y}`;

  return (
    <Modal title={label} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Cobertura del día</div>
          <CoverageTimeline dayOfWeek={dayOfWeek} employees={employees} vacations={vacations} dayStr={dayStr} compact={false} clinicOpen={clinicOpen} clinicClose={clinicClose} assignedEmpId={dayAssignment} />
        </div>

        <div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Presentes ({slots.length})</div>
          {slots.length === 0
            ? <div style={{ fontSize:11, color:"#1e3a5f" }}>Nadie trabajando</div>
            : slots.map(s => (
              <div key={s.empId} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <RoleBadge role={s.role} small />
                <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace", flex:1 }}>{s.name}</span>
                <span style={{ fontSize:11, color:"#475569", fontFamily:"monospace" }}>{fromMin(s.startMin)} – {fromMin(s.endMin)}</span>
              </div>
            ))
          }
        </div>

        {(() => {
          const onVac = employees.filter(e => vacations[e.id]?.[dayStr]);
          return onVac.length > 0 && (
            <div>
              <div style={{ fontSize:9, color:"#334155", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>De vacaciones ({onVac.length})</div>
              {onVac.map(e => (
                <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <RoleBadge role={e.role} small />
                  <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace" }}>{e.name}</span>
                  <span style={{ fontSize:10, color:"#fbbf24", marginLeft:"auto" }}>vacaciones</span>
                </div>
              ))}
            </div>
          );
        })()}

        {onAssign && (
          <div>
            <div style={{ fontSize:9, color:"#334155", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Asignar turno extra</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <select
                value={dayAssignment || ""}
                onChange={e => onAssign(e.target.value || null)}
                style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, color:"#94a3b8", fontSize:12, fontFamily:"monospace", padding:"6px 8px", outline:"none" }}
              >
                <option value="">— Sin asignar —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            {assignedEmp && (
              <div style={{ fontSize:9, color:"#60a5fa", marginTop:5, fontFamily:"monospace" }}>
                {assignedEmp.name} · {fromMin(clinicOpen)} – {fromMin(clinicClose)}
              </div>
            )}
          </div>
        )}

        {gaps.length > 0 && (
          <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8 }}>
            <div style={{ fontSize:9, color:"#f87171", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:6 }}>⚠ Franjas sin veterinario</div>
            {gaps.map((g, i) => (
              <div key={i} style={{ fontSize:11, color:"#fca5a5", fontFamily:"monospace" }}>
                {fromMin(g.startMin)} → {fromMin(g.endMin)} ({((g.endMin - g.startMin) / 60).toFixed(1)}h)
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
