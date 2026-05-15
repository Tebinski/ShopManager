import { MONTHS, CLINIC_OPEN, CLINIC_CLOSE } from "../constants/index.js";
import { parseDkey } from "../utils/calendar.js";
import { fromMin, toMin } from "../utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "../utils/coverage.js";
import Modal from "./Modal.jsx";
import DayTimelineEditor from "./DayTimelineEditor.jsx";

const EMPTY_OVERRIDES = {};

export default function DayDetail({
  dayStr, dayOfWeek, employees, vacations, onClose,
  clinicOpen = CLINIC_OPEN, clinicClose = CLINIC_CLOSE,
  dayAssignment, onAssign, dayOverrides = EMPTY_OVERRIDES, onOverride, onRestore,
}) {
  const isLocumVet = dayAssignment === "locumvet" || (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet");
  const locumStart = (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet" && dayAssignment.start) ? toMin(dayAssignment.start) : clinicOpen;
  const locumEnd   = (typeof dayAssignment === "object" && dayAssignment?.empId === "locumvet" && dayAssignment.end)   ? toMin(dayAssignment.end)   : clinicClose;

  const base = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);

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
  const assignedEmpId = dayAssignment ? (typeof dayAssignment === "object" ? dayAssignment.empId : dayAssignment) : null;
  const assignedEmp = (assignedEmpId && assignedEmpId !== "locumvet") ? employees.find(e => e.id === assignedEmpId) : null;
  const slotStart = assignObj?.start ? toMin(assignObj.start) : clinicOpen;
  const slotEnd   = assignObj?.end   ? toMin(assignObj.end)   : clinicClose;

  const slots = assignedEmp && !vacations[assignedEmpId]?.[dayStr] && !effectiveBase.some(s => s.empId === assignedEmpId)
    ? [...effectiveBase, { empId: assignedEmpId, name: assignedEmp.name, role: assignedEmp.role, startMin: slotStart, endMin: slotEnd }]
    : effectiveBase;

  const slotsWithLocum = isLocumVet
    ? [...slots, { empId: "locumvet", name: "LocumVet", role: "veterinario", startMin: locumStart, endMin: locumEnd }]
    : slots;

  const gaps = getCoverageGaps(slotsWithLocum, clinicOpen, clinicClose);
  const { y, m, d } = parseDkey(dayStr);
  const label = `${d} de ${MONTHS[m]} de ${y}`;

  function handleAutoLocum() {
    const ranges = [...gaps];
    if (isLocumVet) ranges.push({ startMin: locumStart, endMin: locumEnd });
    if (ranges.length === 0) return;
    const start = Math.min(...ranges.map(r => r.startMin));
    const end = Math.max(...ranges.map(r => r.endMin));
    onAssign({ empId: "locumvet", start: fromMin(start), end: fromMin(end) });
  }
  const canAutoLocum = gaps.length > 0;

  return (
    <Modal title={label} onClose={onClose} maxWidth={760}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

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

        {(onOverride || onAssign) && (
          <DayTimelineEditor
            employees={employees}
            vacations={vacations}
            dayOfWeek={dayOfWeek}
            dayStr={dayStr}
            clinicOpen={clinicOpen}
            clinicClose={clinicClose}
            dayAssignment={dayAssignment}
            dayOverrides={dayOverrides}
            onOverride={onOverride}
            onAssign={onAssign}
            onAutoLocum={handleAutoLocum}
            canAutoLocum={canAutoLocum}
            onClose={onClose}
          />
        )}

      </div>
    </Modal>
  );
}
