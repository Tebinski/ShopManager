import { useState } from "react";
import { ROLE_COLORS } from "../constants/index.js";
import { fromMin, toMin } from "../utils/time.js";
import RoleBadge from "./RoleBadge.jsx";

const SNAP = 15;
const MIN_DRAG = 15;
const CLICK_THRESHOLD_PX = 4;

function snapMin(m) { return Math.round(m / SNAP) * SNAP; }

export default function DayTimelineEditor({
  employees, vacations, dayOfWeek, dayStr,
  clinicOpen, clinicClose,
  dayAssignment, dayOverrides,
  onOverride, onAssign,
  onAutoLocum, canAutoLocum, onClose,
}) {
  const [draggingDisplay, setDraggingDisplay] = useState(null);
  const span = clinicClose - clinicOpen;

  const ticks = [];
  for (let t = clinicOpen; t <= clinicClose; t += 120) ticks.push(t);

  function pct(m)    { return `${((m - clinicOpen) / span) * 100}%`; }
  function pctW(s,e) { return `${((e - s) / span) * 100}%`; }

  function minFromX(x, width) {
    return Math.max(clinicOpen, Math.min(clinicClose, snapMin(clinicOpen + (Math.max(0, Math.min(x, width)) / width) * span)));
  }

  function getSlotInfo(empId) {
    if (empId === "locumvet") {
      if (!dayAssignment) return { slot: null, baseStart: null, baseEnd: null };
      const id = typeof dayAssignment === "object" ? dayAssignment.empId : dayAssignment;
      if (id !== "locumvet") return { slot: null, baseStart: null, baseEnd: null };
      const slot = {
        startMin: typeof dayAssignment === "object" && dayAssignment.start ? toMin(dayAssignment.start) : clinicOpen,
        endMin:   typeof dayAssignment === "object" && dayAssignment.end   ? toMin(dayAssignment.end)   : clinicClose,
      };
      return { slot, baseStart: null, baseEnd: null };
    }
    const emp = employees.find(e => e.id === empId);
    if (!emp) return { slot: null, baseStart: null, baseEnd: null };
    const sched = emp.schedule[dayOfWeek];
    const baseStart = sched?.start ? toMin(sched.start) : null;
    const baseEnd   = sched?.end   ? toMin(sched.end)   : null;
    const ov = dayOverrides?.[empId];
    if (ov?.disabled) return { slot: null, baseStart, baseEnd };
    const startMin = ov?.start ? toMin(ov.start) : baseStart;
    const endMin   = ov?.end   ? toMin(ov.end)   : baseEnd;
    if (startMin == null || endMin == null) return { slot: null, baseStart, baseEnd };
    return { slot: { startMin, endMin }, baseStart, baseEnd };
  }

  function saveSlot(empId, lo, hi) {
    const start = fromMin(lo), end = fromMin(hi);
    if (empId === "locumvet") onAssign({ empId: "locumvet", start, end });
    else onOverride(empId, { start, end });
  }

  function clearSlot(empId) {
    if (empId === "locumvet") onAssign(null);
    else onOverride(empId, null);
  }

  // Drag handler: no preventDefault, no setPointerCapture — clicks pass through naturally.
  // Movement threshold means a quick click stays a click (lets onClick on inner bars fire).
  function startDrag(e, empId) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startClientX = e.clientX;
    const localX = startClientX - rect.left;
    const m0 = minFromX(localX, rect.width);
    let dragging = false;
    let endMin = m0;

    function onMove(ev) {
      if (!dragging && Math.abs(ev.clientX - startClientX) < CLICK_THRESHOLD_PX) return;
      dragging = true;
      endMin = minFromX(ev.clientX - rect.left, rect.width);
      setDraggingDisplay({ empId, startMin: m0, endMin });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraggingDisplay(null);
      if (!dragging) return;
      const lo = Math.min(m0, endMin);
      const hi = Math.max(m0, endMin);
      if (hi - lo >= MIN_DRAG) saveSlot(empId, lo, hi);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const rows = [
    ...employees.map(e => ({ id: e.id, emp: e, isLocum: false })),
    { id: "locumvet", emp: null, isLocum: true },
  ];

  return (
    <div style={{ userSelect:"none" }}>

      {/* Tick header — spacer = badge(82)+gap(8)+name(120)+gap(8) = 218px */}
      <div style={{ display:"flex", marginBottom:3 }}>
        <div style={{ width:218, flexShrink:0 }} />
        <div style={{ flex:1, position:"relative", height:14 }}>
          {ticks.map(t => (
            <div key={t} style={{ position:"absolute", left:pct(t), fontSize:7, color:"#64748b", fontFamily:"monospace", transform:"translateX(-50%)" }}>
              {fromMin(t)}
            </div>
          ))}
        </div>
      </div>

      {rows.map(({ id, emp, isLocum }) => {
        const isVac = !isLocum && !!vacations[id]?.[dayStr];
        const { slot, baseStart, baseEnd } = getSlotInfo(id);
        const hasBase = baseStart != null && baseEnd != null;
        const isDragging = draggingDisplay?.empId === id;
        const preview = isDragging ? {
          startMin: Math.min(draggingDisplay.startMin, draggingDisplay.endMin),
          endMin:   Math.max(draggingDisplay.startMin, draggingDisplay.endMin),
        } : null;
        const color = isLocum ? "#fbbf24" : (emp?.color || ROLE_COLORS[emp?.role] || "#94a3b8");

        // Extra portions: override extends beyond the regular schedule
        const extraLeft  = (hasBase && slot && slot.startMin < baseStart) ? { startMin: slot.startMin, endMin: baseStart } : null;
        const extraRight = (hasBase && slot && slot.endMin   > baseEnd)   ? { startMin: baseEnd,       endMin: slot.endMin } : null;

        return (
          <div key={id} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>

            <div style={{ width:82, flexShrink:0 }}>
              {isLocum
                ? <div style={{ width:20, height:20, borderRadius:3, background:"#fbbf2433", border:"1px solid #fbbf2455", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fbbf24" }}>L</div>
                : <RoleBadge role={emp.role} small />}
            </div>

            <span style={{ width:120, flexShrink:0, fontSize:12, fontFamily:"monospace", color: isVac ? "#fbbf2466" : "#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {isLocum ? "LocumVet" : emp.name}
            </span>

            {isVac ? (
              <div style={{ flex:1, display:"flex", alignItems:"center" }}>
                <span style={{ fontSize:10, color:"#fbbf24", fontFamily:"monospace" }}>☀ Vacaciones</span>
              </div>
            ) : (
              <div
                onPointerDown={e => startDrag(e, id)}
                style={{ flex:1, height:22, background:"rgba(255,255,255,0.03)", borderRadius:4, position:"relative", cursor: isDragging ? "ew-resize" : "crosshair", overflow:"hidden", touchAction:"none" }}
              >
                {/* Tick gridlines */}
                {ticks.map(t => (
                  <div key={t} style={{ position:"absolute", left:pct(t), top:0, bottom:0, width:1, background:"rgba(255,255,255,0.05)", pointerEvents:"none" }} />
                ))}

                {/* Regular schedule ghost — always visible as reference */}
                {hasBase && (
                  <div style={{
                    position:"absolute", left:pct(baseStart), width:pctW(baseStart, baseEnd),
                    top:6, bottom:6,
                    background:`${color}18`, border:`1px dashed ${color}28`, borderRadius:2, pointerEvents:"none",
                  }} />
                )}

                {/* Current slot — hidden while dragging a replacement */}
                {slot && !isDragging && (
                  <>
                    {/* Main bar (regular-schedule portion, or full if no base) */}
                    <div
                      onClick={e => { e.stopPropagation(); clearSlot(id); }}
                      title={`${fromMin(slot.startMin)}–${fromMin(slot.endMin)} · click para quitar`}
                      style={{
                        position:"absolute",
                        left:  pct(hasBase ? Math.max(slot.startMin, baseStart ?? slot.startMin) : slot.startMin),
                        width: pctW(
                          hasBase ? Math.max(slot.startMin, baseStart ?? slot.startMin) : slot.startMin,
                          hasBase ? Math.min(slot.endMin, baseEnd ?? slot.endMin) : slot.endMin
                        ),
                        top:2, bottom:2,
                        background:`linear-gradient(90deg,${color}55,${color}88)`,
                        border:`1px solid ${color}55`, borderRadius:3, cursor:"pointer",
                        display:"flex", alignItems:"center", paddingLeft:4, overflow:"hidden",
                      }}
                    >
                      <span style={{ fontSize:7, color, fontFamily:"monospace", whiteSpace:"nowrap", pointerEvents:"none" }}>
                        {fromMin(slot.startMin)}–{fromMin(slot.endMin)}
                      </span>
                    </div>

                    {/* Extra left: before regular schedule */}
                    {extraLeft && (
                      <div
                        onClick={e => { e.stopPropagation(); clearSlot(id); }}
                        title="Horas extra · click para quitar"
                        style={{
                          position:"absolute", left:pct(extraLeft.startMin), width:pctW(extraLeft.startMin, extraLeft.endMin),
                          top:2, bottom:2,
                          background:`${color}33`, border:`1px solid ${color}66`,
                          borderRadius:3, cursor:"pointer",
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}
                      >
                        <span style={{ fontSize:7, color, fontFamily:"monospace", pointerEvents:"none" }}>+</span>
                      </div>
                    )}

                    {/* Extra right: after regular schedule */}
                    {extraRight && (
                      <div
                        onClick={e => { e.stopPropagation(); clearSlot(id); }}
                        title="Horas extra · click para quitar"
                        style={{
                          position:"absolute", left:pct(extraRight.startMin), width:pctW(extraRight.startMin, extraRight.endMin),
                          top:2, bottom:2,
                          background:`${color}33`, border:`1px solid ${color}66`,
                          borderRadius:3, cursor:"pointer",
                          display:"flex", alignItems:"center", paddingLeft:4, overflow:"hidden",
                        }}
                      >
                        <span style={{ fontSize:7, color, fontFamily:"monospace", whiteSpace:"nowrap", pointerEvents:"none" }}>
                          +{fromMin(extraRight.startMin)}–{fromMin(extraRight.endMin)}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Drag preview */}
                {preview && preview.endMin > preview.startMin && (
                  <div style={{
                    position:"absolute", left:pct(preview.startMin), width:pctW(preview.startMin, preview.endMin),
                    top:2, bottom:2,
                    background:`${color}44`, border:`1px dashed ${color}`, borderRadius:3, pointerEvents:"none",
                    display:"flex", alignItems:"center", paddingLeft:4, overflow:"hidden",
                  }}>
                    <span style={{ fontSize:7, color, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                      {fromMin(preview.startMin)}–{fromMin(preview.endMin)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8, gap:8 }}>
        <div style={{ display:"flex", gap:8 }}>
          {onAutoLocum && (
            <button
              onClick={onAutoLocum}
              disabled={!canAutoLocum}
              title={canAutoLocum ? "Asigna LocumVet para cubrir los huecos" : "No hay huecos que cubrir"}
              style={{
                background: canAutoLocum ? "rgba(251,191,36,0.1)" : "transparent",
                border:`1px solid ${canAutoLocum ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.04)"}`,
                color: canAutoLocum ? "#fbbf24" : "#334155",
                padding:"4px 12px", borderRadius:6,
                cursor: canAutoLocum ? "pointer" : "default",
                fontSize:10, fontFamily:"monospace", letterSpacing:1,
              }}
            >
              ⚡ AUTOCOMPLETAR LOCUMVET
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background:"rgba(96,165,250,0.1)",
            border:"1px solid rgba(96,165,250,0.3)",
            color:"#60a5fa",
            padding:"4px 12px", borderRadius:6,
            cursor:"pointer",
            fontSize:10, fontFamily:"monospace", letterSpacing:1,
          }}
        >
          ✓ GUARDAR CAMBIOS
        </button>
      </div>
    </div>
  );
}
