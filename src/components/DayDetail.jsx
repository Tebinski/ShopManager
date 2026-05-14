import { useState, useEffect } from "react";
import { MONTHS, CLINIC_OPEN, CLINIC_CLOSE, ROLE_COLORS } from "../constants/index.js";
import { parseDkey } from "../utils/calendar.js";
import { fromMin, toMin } from "../utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "../utils/coverage.js";
import Modal from "./Modal.jsx";
import RoleBadge from "./RoleBadge.jsx";
import CoverageTimeline from "./CoverageTimeline.jsx";
import TimeInput from "./TimeInput.jsx";

const EMPTY_OVERRIDES = {};

export default function DayDetail({ dayStr, dayOfWeek, employees, vacations, onClose, clinicOpen = CLINIC_OPEN, clinicClose = CLINIC_CLOSE, dayAssignment, onAssign, dayOverrides = EMPTY_OVERRIDES, onOverride, onToggleVacation }) {
  // dayAssignment may be "locumvet", a string (empId), or an object { empId, start, end, rotation }
  const isLocumVet = dayAssignment === "locumvet" || (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet");
  const locumStart = (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet" && dayAssignment.start) ? toMin(dayAssignment.start) : clinicOpen;
  const locumEnd   = (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet" && dayAssignment.end)   ? toMin(dayAssignment.end)   : clinicClose;
  
  const base  = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);

  // Apply saved overrides so the display reflects what was last saved
  const effectiveBase = (() => {
    if (dayOverrides === EMPTY_OVERRIDES || Object.keys(dayOverrides).length === 0) return base;
    const next = [...base];
    Object.entries(dayOverrides).forEach(([empId, ov]) => {
      if (!ov || vacations[empId]?.[dayStr]) return;
      const idx = next.findIndex(s => s.empId === empId);
      if (ov.disabled) { if (idx !== -1) next.splice(idx, 1); return; }
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;
      const startMin = ov.start ? toMin(ov.start) : (idx !== -1 ? next[idx].startMin : clinicOpen);
      const endMin   = ov.end   ? toMin(ov.end)   : (idx !== -1 ? next[idx].endMin   : clinicClose);
      const slot = { empId, name: emp.name, role: emp.role, startMin, endMin };
      if (idx !== -1) next[idx] = slot; else next.push(slot);
    });
    return next;
  })();

  const assignObj = (dayAssignment && typeof dayAssignment === "object") ? dayAssignment : null;
  const assignedEmpId = dayAssignment
    ? (typeof dayAssignment === "object" ? dayAssignment.empId : dayAssignment)
    : null;
  const assignedEmp = (assignedEmpId && assignedEmpId !== "locumvet") ? employees.find(e => e.id === assignedEmpId) : null;
  const slotStart = assignObj && assignObj.start ? toMin(assignObj.start) : clinicOpen;
  const slotEnd   = assignObj && assignObj.end   ? toMin(assignObj.end)   : clinicClose;

  const slots = assignedEmp && !vacations[assignedEmpId]?.[dayStr] && !effectiveBase.some(s => s.empId === assignedEmpId)
    ? [...effectiveBase, { empId: assignedEmpId, name: assignedEmp.name, role: assignedEmp.role, startMin: slotStart, endMin: slotEnd }]
    : effectiveBase;
  
  // Add LocumVet to slots if assigned, using any stored custom hours
  const slotsWithLocum = isLocumVet
    ? [...slots, { empId: "locumvet", name: "LocumVet", role: "veterinario", startMin: locumStart, endMin: locumEnd }]
    : slots;
  
  const gaps  = getCoverageGaps(slotsWithLocum, clinicOpen, clinicClose);
  const { y, m, d } = parseDkey(dayStr);
  const label = `${d} de ${MONTHS[m]} de ${y}`;

  const [selEmp, setSelEmp] = useState(assignedEmpId || "");
  const [start, setStart]   = useState(assignObj && assignObj.start ? assignObj.start : fromMin(clinicOpen));
  const [end, setEnd]       = useState(assignObj && assignObj.end   ? assignObj.end   : fromMin(clinicClose));
  const [rotation, setRotation] = useState(!!assignObj?.rotation);
  const [localOverrides, setLocalOverrides] = useState(dayOverrides || {});

  useEffect(() => {
    setLocalOverrides(dayOverrides || {});
  }, [dayOverrides]);

  return (
    <Modal title={label} onClose={onClose} maxWidth={760}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Cobertura del día</div>
          <CoverageTimeline dayOfWeek={dayOfWeek} employees={employees} vacations={vacations} dayStr={dayStr} compact={false} clinicOpen={clinicOpen} clinicClose={clinicClose} assignedEmpId={dayAssignment} dayOverrides={dayOverrides} />
        </div>

        <div>
          <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Presentes ({slotsWithLocum.length})</div>
          {slotsWithLocum.length === 0
            ? <div style={{ fontSize:11, color:"#94a3b8" }}>Nadie trabajando</div>
            : slotsWithLocum.map(s => (
              <div key={s.empId} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                {s.empId === "locumvet" 
                  ? <div style={{ width:20, height:20, borderRadius:3, background:"#fbbf2433", border:"1px solid #fbbf2455", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fbbf24" }}>L</div>
                  : <RoleBadge role={s.role} small />
                }
                <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace", flex:1 }}>{s.name}</span>
                <span style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace" }}>{fromMin(s.startMin)} – {fromMin(s.endMin)}</span>
              </div>
            ))
          }
        </div>

        {(() => {
          const onVac = employees.filter(e => vacations[e.id]?.[dayStr]);
          const noWork = employees.filter(e => !e.schedule[dayOfWeek] && !vacations[e.id]?.[dayStr] && e.id !== assignedEmpId);
          const working = employees.filter(e => slots.some(s => s.empId === e.id));
          
          return (
            <>
              {working.length > 0 && (
                <div>
                  <div style={{ fontSize:9, color:"#4ade80", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Trabajando hoy ({working.length})</div>
                  {working.map(e => {
                    const slot = slots.find(s => s.empId === e.id);
                    return (
                      <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <RoleBadge role={e.role} small />
                        <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace", flex:1 }}>{e.name}</span>
                        <span style={{ fontSize:10, color:"#4ade80" }}>{fromMin(slot.startMin)} – {fromMin(slot.endMin)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {onVac.length > 0 && (
                <div>
                  <div style={{ fontSize:9, color:"#fbbf24", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>De vacaciones ({onVac.length})</div>
                  {onVac.map(e => (
                    <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <RoleBadge role={e.role} small />
                      <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace" }}>{e.name}</span>
                      <span style={{ fontSize:10, color:"#fbbf24", marginLeft:"auto" }}>☀ Vacaciones</span>
                    </div>
                  ))}
                </div>
              )}

              {noWork.length > 0 && (
                <div>
                  <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>No trabaja este día ({noWork.length})</div>
                  {noWork.map(e => (
                    <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <RoleBadge role={e.role} small />
                      <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace" }}>{e.name}</span>
                      <span style={{ fontSize:10, color:"#94a3b8", marginLeft:"auto" }}>— sin turno</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {onOverride && (
          <div>
            <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Editar horarios por empleado</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {employees.map(emp => {
                const isVac = !!vacations[emp.id]?.[dayStr];
                const sched = emp.schedule[dayOfWeek];
                const ov = localOverrides[emp.id] || {};
                const startVal = ov.start ?? (sched ? sched.start : "");
                const endVal = ov.end ?? (sched ? sched.end : "");
                const disabled = !!ov.disabled;
                return (
                  <div key={emp.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:82, flexShrink:0 }}><RoleBadge role={emp.role} small /></div>
                    <span style={{ fontSize:12, color:"#94a3b8", fontFamily:"monospace", width:130, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.name}</span>
                    {isVac ? (
                      <span style={{ fontSize:10, color:"#fbbf24", marginLeft:"auto" }}>☀ Vacaciones</span>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <TimeInput value={startVal} onChange={v => setLocalOverrides(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id]||{}), start: v } }))} color="#60a5fa" />
                        <span style={{ color:"#94a3b8" }}>—</span>
                        <TimeInput value={endVal} onChange={v => setLocalOverrides(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id]||{}), end: v } }))} color="#60a5fa" />
                        <label style={{ display:"flex", alignItems:"center", gap:6, color:"#94a3b8", fontSize:12 }}>
                          <input type="checkbox" checked={disabled} onChange={e => setLocalOverrides(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id]||{}), disabled: e.target.checked } }))} /> No trabaja
                        </label>
                        <button onClick={() => {
                          const cur = localOverrides[emp.id] || {};
                          if (cur.disabled) onOverride(emp.id, { disabled: true });
                          else if (cur.start || cur.end) {
                            const payload = {};
                            if (cur.start) payload.start = cur.start;
                            if (cur.end) payload.end = cur.end;
                            onOverride(emp.id, payload);
                          } else {
                            onOverride(emp.id, null);
                          }
                        }} style={{ background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", color:"#4ade80", padding:"6px 10px", borderRadius:8, cursor:"pointer", fontSize:11, marginLeft:6 }}>Guardar</button>
                        <button onClick={() => { setLocalOverrides(prev => { const copy = { ...prev }; delete copy[emp.id]; return copy; }); onOverride(emp.id, null); }} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#94a3b8", padding:"6px 10px", borderRadius:8, cursor:"pointer", fontSize:11 }}>Quitar</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {onAssign && (
          <div>
            <div style={{ fontSize:9, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Reasignar cobertura</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <select
                value={selEmp}
                onChange={e => setSelEmp(e.target.value)}
                style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, color:"#94a3b8", fontSize:12, fontFamily:"monospace", padding:"6px 8px", outline:"none" }}
              >
                <option value="">— Sin asignar —</option>
                <option value="locumvet">🟨 LocumVet</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {selEmp && (
              <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8 }}>
                <TimeInput value={start} onChange={v => setStart(v)} color={selEmp === "locumvet" ? "#fbbf24" : "#60a5fa"} />
                <span style={{ color:"#94a3b8" }}>—</span>
                <TimeInput value={end} onChange={v => setEnd(v)} color={selEmp === "locumvet" ? "#fbbf24" : "#60a5fa"} />
                {selEmp !== "locumvet" && (
                  <label style={{ display:"flex", alignItems:"center", gap:6, marginLeft:8, color:"#94a3b8", fontSize:12 }}>
                    <input type="checkbox" checked={rotation} onChange={e => setRotation(e.target.checked)} /> Rotación
                  </label>
                )}
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button onClick={() => {
                if (!selEmp) {
                  onAssign(null);
                } else if (selEmp === "locumvet") {
                  onAssign({ empId: "locumvet", start, end });
                } else {
                  onAssign({ empId: selEmp, start, end, rotation });
                }
              }} style={{ background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", color:"#4ade80", padding:"6px 10px", borderRadius:8, cursor:"pointer", fontSize:11 }}>Guardar</button>
              <button onClick={() => onAssign(null)} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#94a3b8", padding:"6px 10px", borderRadius:8, cursor:"pointer", fontSize:11 }}>Quitar</button>
            </div>
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
