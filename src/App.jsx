import { useState, useMemo, useEffect, useRef } from "react";
import { MONTHS, DAYS_SHORT, ROLE_COLORS, DEFAULT_SCHEDULE, SAMPLE_EMPLOYEES, DEFAULT_CLINIC_CONFIG } from "./constants/index.js";
import { getDaysInMonth, getFirstDow, dkey, parseDkey, uid } from "./utils/calendar.js";
import { shiftHours, toMin, fromMin } from "./utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "./utils/coverage.js";
import { useStorage } from "./hooks/useStorage.js";
import CoverageTimeline from "./components/CoverageTimeline.jsx";
import EmployeeModal    from "./components/EmployeeModal.jsx";
import TimeInput        from "./components/TimeInput.jsx";
import DayDetail        from "./components/DayDetail.jsx";
import YearMini         from "./components/YearMini.jsx";
import RoleBadge        from "./components/RoleBadge.jsx";
import Modal            from "./components/Modal.jsx";

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export default function App() {
  const today = new Date();
  const { loaded, saveStatus, persist, initialData } = useStorage();

  const [tab,         setTab]         = useState("calendar");
  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(today.getMonth());
  const [employees,   setEmployees]   = useState(SAMPLE_EMPLOYEES);
  const [vacations,   setVacations]   = useState({});
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [editingEmp,  setEditingEmp]  = useState(null);
  const [detailDay,   setDetailDay]   = useState(null);
  const [showYear,    setShowYear]    = useState(true);
  const [importMsg,   setImportMsg]   = useState(null);
  const [extRate,      setExtRate]      = useState(40);
  const [clinicConfig, setClinicConfig] = useState(DEFAULT_CLINIC_CONFIG);
  const [dayAssignments, setDayAssignments] = useState({});
  const [dayOverrides, setDayOverrides] = useState({});
  const [fontScale,    setFontScale]   = useState(1);
  const [hiddenEmps,   setHiddenEmps]  = useState([]);
  const [gapAlert,     setGapAlert]    = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!initialData) return;
    if (Array.isArray(initialData.employees) && initialData.employees.length) setEmployees(initialData.employees);
    if (initialData.vacations && typeof initialData.vacations === "object") setVacations(initialData.vacations);
    if (initialData.clinicConfig && typeof initialData.clinicConfig === "object") setClinicConfig(initialData.clinicConfig);
    if (initialData.dayAssignments && typeof initialData.dayAssignments === "object") setDayAssignments(initialData.dayAssignments);
    if (initialData.dayOverrides && typeof initialData.dayOverrides === "object") setDayOverrides(initialData.dayOverrides);
  }, [initialData]);

  function empColor(emp) {
    return emp.color || ROLE_COLORS[emp.role] || "#94a3b8";
  }

  function toggleHide(empId) {
    setHiddenEmps(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
  }

  function dayClinicHours(mb) {
    const cfg = mb <= 4 ? clinicConfig.weekday : mb === 5 ? clinicConfig.saturday : clinicConfig.sunday;
    return cfg ? { open: toMin(cfg.open), close: toMin(cfg.close) } : null;
  }

  function withAssignment(slots, dayStr, clinicHours) {
    const next = [...slots];

    // apply per-employee overrides for the day
    const overridesForDay = dayOverrides[dayStr] || {};
    Object.keys(overridesForDay).forEach(empId => {
      const ov = overridesForDay[empId] || {};
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;
      if (vacations[empId]?.[dayStr]) return; // vacations take precedence
      const idx = next.findIndex(s => s.empId === empId);
      if (ov.disabled) {
        if (idx !== -1) next.splice(idx, 1);
        return;
      }
      const startMin = ov.start ? toMin(ov.start) : (idx !== -1 ? next[idx].startMin : clinicHours.open);
      const endMin = ov.end ? toMin(ov.end) : (idx !== -1 ? next[idx].endMin : clinicHours.close);
      const slot = { empId, name: emp.name, role: emp.role, startMin, endMin };
      if (idx !== -1) next[idx] = slot; else next.push(slot);
    });

    const a = dayAssignments[dayStr];
    if (!a) return next;
    const empId = typeof a === "string" ? a : a.empId;
    if (!empId || vacations[empId]?.[dayStr] || hiddenEmps.includes(empId)) return next;
    // keep existing behavior for 'locumvet' (handled elsewhere in UI)
    if (empId === "locumvet") return next;
    const emp = employees.find(e => e.id === empId);
    if (!emp || next.some(s => s.empId === empId)) return next;
    const startMin = (typeof a === "object" && a.start) ? toMin(a.start) : clinicHours.open;
    const endMin   = (typeof a === "object" && a.end)   ? toMin(a.end)   : clinicHours.close;
    return [...next, { empId, name: emp.name, role: emp.role, startMin, endMin }];
  }

  function assignDay(dayStr, assignment) {
    const next = { ...dayAssignments };
    if (!assignment) {
      delete next[dayStr];
    } else {
      // allow passing empId string or full object { empId, start, end, rotation }
      next[dayStr] = typeof assignment === "string" ? assignment : { ...(assignment || {}) };
    }
    setDayAssignments(next);
    persist({ employees, vacations, clinicConfig, dayAssignments: next, dayOverrides });
  }

  function updateDayOverride(dayStr, empId, override) {
    const next = { ...dayOverrides };
    const dayMap = next[dayStr] ? { ...next[dayStr] } : {};
    if (!override) {
      delete dayMap[empId];
      if (Object.keys(dayMap).length === 0) delete next[dayStr];
      else next[dayStr] = dayMap;
    } else {
      dayMap[empId] = override;
      next[dayStr] = dayMap;
    }
    setDayOverrides(next);
    persist({ employees, vacations, clinicConfig, dayAssignments, dayOverrides: next });
  }

  function saveEmployee(emp) {
    const next = employees.some(e => e.id === emp.id)
      ? employees.map(e => e.id === emp.id ? emp : e)
      : [...employees, emp];
    setEmployees(next);
    persist({ employees:next, vacations, clinicConfig, dayAssignments, dayOverrides });
    setEditingEmp(null);
  }

  function deleteEmployee(id) {
    const next = employees.filter(e => e.id !== id);
    const vacs = { ...vacations };
    delete vacs[id];
    setEmployees(next);
    setVacations(vacs);
    if (selectedEmp === id) setSelectedEmp(null);
    persist({ employees:next, vacations:vacs, clinicConfig, dayAssignments, dayOverrides });
  }

  function toggleVacation(empId, day) {
    const dow = new Date(day).getDay();
    const mb  = dow === 0 ? 6 : dow - 1;
    const dh  = dayClinicHours(mb);

    const slotsBefore = dh ? withAssignment(getWorkingSlots(mb, visibleEmployees, vacations, day), day, dh) : [];
    const gapsBefore  = dh ? getCoverageGaps(slotsBefore, dh.open, dh.close) : [];

    const ev   = { ...(vacations[empId] || {}) };
    const wasOn = !!ev[day];
    if (ev[day]) delete ev[day]; else ev[day] = true;
    const next = { ...vacations, [empId]:ev };

    const slotsAfter = dh ? withAssignment(getWorkingSlots(mb, visibleEmployees, next, day), day, dh) : [];
    const gapsAfter  = dh ? getCoverageGaps(slotsAfter, dh.open, dh.close) : [];

    const totalBefore = gapsBefore.reduce((a, g) => a + (g.endMin - g.startMin), 0);
    const totalAfter  = gapsAfter.reduce((a, g) => a + (g.endMin - g.startMin), 0);
    const added  = Math.max(0, totalAfter - totalBefore);
    const removed = Math.max(0, totalBefore - totalAfter);

    setVacations(next);
    persist({ employees, vacations:next, clinicConfig, dayAssignments, dayOverrides });

    if (dh && (added > 0 || removed > 0)) {
      const emp = employees.find(e => e.id === empId);
      setGapAlert({ day, empId, empName: emp?.name || empId, added, removed, gapsBefore, gapsAfter, clinicOpen: dh.open, clinicClose: dh.close });
    } else {
      setGapAlert(null);
    }
  }

  function exportState() {
    const data = { version:1, exportedAt:new Date().toISOString(), employees, vacations };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `clinica-vacaciones-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.employees)) throw new Error("Formato inválido");
        setEmployees(data.employees);
        setVacations(data.vacations || {});
        setSelectedEmp(null);
        persist({ employees:data.employees, vacations:data.vacations || {}, clinicConfig, dayAssignments, dayOverrides });
        setImportMsg({ ok:true, text:`✓ Cargado: ${data.employees.length} empleados` });
      } catch (err) {
        setImportMsg({ ok:false, text:`✕ Error: ${err.message}` });
      }
      setTimeout(() => setImportMsg(null), 3500);
    };
    reader.readAsText(file);
  }

  const usedHoursMap = useMemo(() => {
    const map = {};
    employees.forEach(emp => {
      let h = 0;
      Object.keys(vacations[emp.id] || {}).forEach(k => {
        const { y, m, d } = parseDkey(k);
        const dow = new Date(y, m, d).getDay();
        const mb  = dow === 0 ? 6 : dow - 1;
        h += shiftHours(emp.schedule[mb]);
      });
      map[emp.id] = h;
    });
    return map;
  }, [employees, vacations]);

  const monthlyCost = useMemo(() => {
    const days = getDaysInMonth(viewYear, viewMonth);
    let totalMin = 0;
    for (let d = 1; d <= days; d++) {
      const dow = new Date(viewYear, viewMonth, d).getDay();
      const mb  = dow === 0 ? 6 : dow - 1;
      const dh  = dayClinicHours(mb);
      if (!dh) continue;
      const ds    = dkey(viewYear, viewMonth, d);
      // Skip if day is covered by LocumVet
      if (dayAssignments[ds] === "locumvet") continue;
      const slots = withAssignment(getWorkingSlots(mb, employees, vacations, ds), ds, dh);
      getCoverageGaps(slots, dh.open, dh.close).forEach(g => { totalMin += g.endMin - g.startMin; });
    }
    return { hours: totalMin / 60, cost: (totalMin / 60) * extRate };
  }, [viewYear, viewMonth, employees, vacations, extRate, clinicConfig, dayAssignments]);

  const monthlyGaps = useMemo(() => {
    const gaps = [];
    const days = getDaysInMonth(viewYear, viewMonth);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(viewYear, viewMonth, d).getDay();
      const mb  = dow === 0 ? 6 : dow - 1;
      const dh  = dayClinicHours(mb);
      if (!dh) continue;
      const ds    = dkey(viewYear, viewMonth, d);
      const slots = withAssignment(getWorkingSlots(mb, employees, vacations, ds), ds, dh);
      const dayGaps = getCoverageGaps(slots, dh.open, dh.close);
      dayGaps.forEach(g => {
        const isCovered = dayAssignments[ds] && (typeof dayAssignments[ds] === "string" ? dayAssignments[ds] === "locumvet" : dayAssignments[ds].empId === "locumvet");
        gaps.push({ dayStr: ds, year: viewYear, month: viewMonth, day: d, startMin: g.startMin, endMin: g.endMin, durationMin: g.endMin - g.startMin, isCovered });
      });
    }
    return gaps;
  }, [viewYear, viewMonth, employees, vacations, clinicConfig, dayAssignments]);

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  const dim = getDaysInMonth(viewYear, viewMonth);
  const fd  = getFirstDow(viewYear, viewMonth);

  const cells = [];
  for (let i = fd; i > 0; i--) {
    const d = new Date(viewYear, viewMonth, 1 - i);
    cells.push({ day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), outside: true });
  }
  for (let d = 1; d <= dim; d++) {
    cells.push({ day: d, month: viewMonth, year: viewYear, outside: false });
  }
  const rem = cells.length % 7;
  if (rem > 0) {
    for (let i = 1; i <= 7 - rem; i++) {
      const d = new Date(viewYear, viewMonth + 1, i);
      cells.push({ day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), outside: true });
    }
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const visibleEmployees = employees.filter(e => !hiddenEmps.includes(e.id));

  const saveLabel = saveStatus === "saving" ? "● GUARDANDO…" : saveStatus === "nostorage" ? "○ SIN ALMACENAMIENTO" : "● GUARDADO";
  const saveColor = saveStatus === "saving" ? "#fbbf24" : saveStatus === "nostorage" ? "#475569" : "#1a4030";

  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:"#070e18", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontFamily:"monospace", fontSize:11, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase" }}>Cargando…</span>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#070e18", color:"#e2e8f0", fontFamily:"monospace", padding:"20px 16px", zoom:fontScale }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:"radial-gradient(circle at 15% 15%,#0a2040 0%,transparent 50%),radial-gradient(circle at 85% 85%,#0d1a0a 0%,transparent 50%)" }} />
      <div style={{ position:"relative", maxWidth:1140, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:24 }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:6, color:"#1e4a6a", textTransform:"uppercase", marginBottom:4 }}>Sistema de gestión</div>
            <h1 style={{ margin:0, fontSize:26, fontWeight:700, color:"#f1f5f9", letterSpacing:-1 }}>
              Clínica <span style={{ color:"#4ade80" }}>·</span> Vacaciones
            </h1>
            <div style={{ fontSize:8, color:saveColor, letterSpacing:2, marginTop:5, transition:"color 0.3s" }}>{saveLabel}</div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
            <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:4 }}>
              {[["calendar","📅 Calendario"],["coverage","📊 Cobertura"],["staff","👥 Empleados"],["clinic","⚙ Clínica"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.08)":"none", border:tab===t?"1px solid rgba(255,255,255,0.1)":"1px solid transparent", borderRadius:7, padding:"6px 14px", cursor:"pointer", color:tab===t?"#e2e8f0":"#475569", fontSize:11, fontFamily:"monospace", letterSpacing:1 }}>{l}</button>
              ))}
            </div>

            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:2 }}>
                {[0.85,1,1.15,1.3].map(s => (
                  <button key={s} onClick={() => setFontScale(s)} style={{ background:fontScale===s?"rgba(255,255,255,0.1)":"none", border:"none", borderRadius:5, color:fontScale===s?"#e2e8f0":"#475569", fontSize:11, fontFamily:"monospace", padding:"4px 7px", cursor:"pointer", fontWeight:700 }}>A{s===0.85?"−−":s===1?"":s===1.15?"+":"++"}
                  </button>
                ))}
              </div>
              <button onClick={exportState} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#4ade80", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}>💾 Guardar copia</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#60a5fa", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}>📂 Cargar copia</button>
              <input ref={fileInputRef} type="file" accept=".json" style={{ display:"none" }} onChange={e => { importState(e.target.files[0]); e.target.value = ""; }} />
              {importMsg && (
                <span style={{ fontSize:9, fontFamily:"monospace", color:importMsg.ok?"#4ade80":"#f87171", background:importMsg.ok?"rgba(74,222,128,0.08)":"rgba(239,68,68,0.08)", border:`1px solid ${importMsg.ok?"rgba(74,222,128,0.2)":"rgba(239,68,68,0.2)"}`, borderRadius:6, padding:"4px 8px" }}>
                  {importMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── CALENDAR TAB ── */}
        {tab === "calendar" && (
          <div style={{ display:"grid", gridTemplateColumns:"240px 1fr 190px", gap:18, alignItems:"start" }}>

            {/* Left panel */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:8, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase", marginBottom:2 }}>Selecciona empleado</div>
              {employees.map(emp => {
                const isSel   = selectedEmp === emp.id;
                const isHidden = hiddenEmps.includes(emp.id);
                const c       = empColor(emp);
                const used    = usedHoursMap[emp.id] || 0;
                const over    = used > emp.annualHours;
                return (
                  <div key={emp.id} onClick={() => setSelectedEmp(isSel ? null : emp.id)} style={{ background:isSel?`${c}18`:"rgba(255,255,255,0.03)", border:`1px solid ${isSel?c+"44":"rgba(255,255,255,0.06)"}`, borderRadius:10, padding:"9px 11px", cursor:"pointer", transition:"all 0.15s", opacity:isHidden?0.45:1 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:"50%", background:`${c}22`, border:`1.5px solid ${c}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:c, fontWeight:700 }}>
                          {emp.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                        </div>
                        <span style={{ fontSize:11, color:isSel?"#f1f5f9":"#94a3b8" }}>{emp.name.split(" ")[0]}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <RoleBadge role={emp.role} small />
                        <button onClick={e => { e.stopPropagation(); toggleHide(emp.id); }} title={isHidden?"Mostrar en calendario":"Ocultar del calendario"} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:isHidden?"#1e3a5f":c, padding:"0 2px", lineHeight:1, opacity:isHidden?0.6:1 }}>
                          {isHidden ? "○" : "●"}
                        </button>
                      </div>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:2, height:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min((used / (emp.annualHours || 1)) * 100, 100)}%`, background:over?"#ef4444":c, borderRadius:2, transition:"width 0.3s" }} />
                    </div>
                    <div style={{ fontSize:8, color:"#334155", marginTop:3 }}>
                      <span style={{ color:over?"#f87171":"#475569" }}>{used.toFixed(0)}h</span>/{emp.annualHours}h{over && <span style={{ color:"#f87171" }}> ⚠</span>}
                    </div>
                  </div>
                );
              })}

              {selectedEmp && (
                <div style={{ padding:"8px 10px", background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.15)", borderRadius:8 }}>
                  <div style={{ fontSize:8, color:"#60a5fa", letterSpacing:1, marginBottom:3 }}>MODO EDICIÓN</div>
                  <div style={{ fontSize:9, color:"#475569" }}>Clic en día → marcar vacaciones de <span style={{ color:"#94a3b8" }}>{employees.find(e => e.id === selectedEmp)?.name.split(" ")[0]}</span></div>
                  <button onClick={() => setSelectedEmp(null)} style={{ marginTop:7, background:"none", border:"1px solid rgba(255,255,255,0.07)", borderRadius:5, color:"#475569", fontSize:8, padding:"3px 8px", cursor:"pointer", fontFamily:"monospace" }}>Deseleccionar</button>
                </div>
              )}

              {/* External vet cost */}
              <div style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:10, padding:"10px 12px", marginTop:4 }}>
                <div style={{ fontSize:8, letterSpacing:3, color:"#92710a", textTransform:"uppercase", marginBottom:6 }}>Cobertura externa</div>
                <div style={{ fontSize:22, fontWeight:700, color:"#fbbf24", letterSpacing:-1, lineHeight:1 }}>
                  {monthlyCost.cost.toLocaleString("es-ES", { minimumFractionDigits:0, maximumFractionDigits:0 })} €
                </div>
                <div style={{ fontSize:8, color:"#78560a", marginTop:3 }}>
                  {monthlyCost.hours.toFixed(1)} h de hueco · {MONTHS[viewMonth]}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:8 }}>
                  <span style={{ fontSize:8, color:"#78560a" }}>Tarifa €/h</span>
                  <input
                    type="number"
                    min="0"
                    value={extRate}
                    onChange={e => setExtRate(Math.max(0, Number(e.target.value)))}
                    style={{ width:52, background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:5, color:"#fbbf24", fontSize:11, fontFamily:"monospace", padding:"3px 6px", outline:"none" }}
                  />
                </div>
              </div>

              <div style={{ marginTop:6 }}>
                <button onClick={() => setShowYear(v => !v)} style={{ background:"none", border:"none", cursor:"pointer", color:"#1e3a5f", fontSize:8, letterSpacing:3, textTransform:"uppercase", fontFamily:"monospace", marginBottom:6, padding:0 }}>
                  {showYear ? "▼" : "▶"} Vista anual
                </button>
                {showYear && <YearMini year={viewYear} employees={employees} vacations={vacations} today={today} onNavigate={m => setViewMonth(m)} viewMonth={viewMonth} clinicConfig={clinicConfig} />}
              </div>
            </div>

            {/* Calendar */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <button onClick={prevMonth} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, color:"#60a5fa", fontSize:17, width:34, height:34, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:18, color:"#f1f5f9" }}>{MONTHS[viewMonth]}</div>
                  <div style={{ fontSize:10, color:"#334155" }}>{viewYear}</div>
                </div>
                <button onClick={nextMonth} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, color:"#60a5fa", fontSize:17, width:34, height:34, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
              </div>

              {/* Day names header */}
              <div style={{ display:"grid", gridTemplateColumns:"28px repeat(7,1fr)", gap:3, marginBottom:4 }}>
                <div />
                {DAYS_SHORT.map(d => <div key={d} style={{ textAlign:"center", fontSize:8, color:"#1e3a5f", letterSpacing:2, padding:"3px 0" }}>{d}</div>)}
              </div>

              {/* Calendar — one row per week */}
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {weeks.map((week, wi) => {
                  const weekNum = getISOWeek(new Date(week[0].year, week[0].month, week[0].day));
                  const selColor = ROLE_COLORS[employees.find(e => e.id === selectedEmp)?.role] || "#60a5fa";
                  return (
                    <div key={wi} style={{ display:"grid", gridTemplateColumns:"28px repeat(7,1fr)", gap:3 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:6 }}>
                        <span style={{ fontSize:7, color:"#1e3a5f", fontFamily:"monospace", letterSpacing:0 }}>W{weekNum}</span>
                      </div>
                      {week.map((cell, di) => {
                        const { day, month, year, outside } = cell;
                        const dayStr = dkey(year, month, day);
                        const dow    = new Date(year, month, day).getDay();
                        const mb     = dow === 0 ? 6 : dow - 1;
                        const dh     = dayClinicHours(mb);
                        const isWknd = !dh;
                        const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

                        if (outside) return (
                          <div key={di} style={{ borderRadius:8, padding:"5px 4px", minHeight:80, background:"rgba(255,255,255,0.01)", border:"1px solid rgba(255,255,255,0.02)", opacity:0.35 }}>
                            <span style={{ fontSize:12, color:"#475569" }}>{day}</span>
                          </div>
                        );

                        const onVac    = employees.filter(e => vacations[e.id]?.[dayStr]);
                        const selOnVac = selectedEmp && vacations[selectedEmp]?.[dayStr];
                        const slots    = isWknd ? [] : withAssignment(getWorkingSlots(mb, visibleEmployees, vacations, dayStr), dayStr, dh);
                        const gaps     = isWknd ? [] : getCoverageGaps(slots, dh.open, dh.close);
                        const hasGap   = gaps.length > 0;

                        return (
                          <div
                            key={dayStr}
                            onClick={() => {
                              if (selectedEmp && !isWknd) toggleVacation(selectedEmp, dayStr);
                              else if (!selectedEmp && !isWknd) setDetailDay({ dayStr, mb });
                            }}
                            style={{ borderRadius:8, padding:"5px 4px", cursor:isWknd?"default":"pointer", background:hasGap?"rgba(239,68,68,0.08)":selOnVac?`${selColor}18`:isWknd?"rgba(255,255,255,0.01)":"rgba(255,255,255,0.03)", border:isToday?"1.5px solid rgba(96,165,250,0.45)":hasGap?"1px solid rgba(239,68,68,0.2)":selOnVac?"1px solid rgba(96,165,250,0.2)":"1px solid rgba(255,255,255,0.04)", minHeight:80, display:"flex", flexDirection:"column", transition:"all 0.12s" }}
                          >
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3, padding:"0 1px" }}>
                              <span style={{ fontSize:12, color:isWknd?"#1e3a5f":isToday?"#60a5fa":"#94a3b8", fontWeight:isToday?700:400 }}>{day}</span>
                              {hasGap && <span style={{ fontSize:8, color:"#f87171" }}>⚠</span>}
                            </div>
                            {onVac.length > 0 && (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:2, padding:"0 1px", marginBottom:3 }}>
                                {onVac.map(e => (
                                  <div key={e.id} title={e.name} style={{ width:14, height:14, borderRadius:"50%", background:`${ROLE_COLORS[e.role]||"#94a3b8"}33`, border:`1px solid ${ROLE_COLORS[e.role]||"#94a3b8"}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:6, color:ROLE_COLORS[e.role] }}>{e.name[0]}</div>
                                ))}
                              </div>
                            )}
                            {!isWknd && (
                              <div style={{ marginTop:"auto" }}>
                                <CoverageTimeline dayOfWeek={mb} employees={visibleEmployees} vacations={vacations} dayStr={dayStr} compact={true} clinicOpen={dh.open} clinicClose={dh.close} assignedEmpId={dayAssignments[dayStr]} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap", alignItems:"center" }}>
                {employees.map(e => (
                  <div key={e.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:12, height:12, borderRadius:"50%", background:`${ROLE_COLORS[e.role]}33`, border:`1px solid ${ROLE_COLORS[e.role]}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:6, color:ROLE_COLORS[e.role] }}>{e.name[0]}</div>
                    <span style={{ fontSize:8, color:"#334155" }}>{e.name.split(" ")[0]}</span>
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:20, height:5, borderRadius:2, background:"rgba(239,68,68,0.6)" }} />
                  <span style={{ fontSize:8, color:"#334155" }}>Hueco cobertura</span>
                </div>
                <div style={{ fontSize:8, color:"#1e3a5f" }}>· Clic en día (sin selección) para ver detalle</div>
              </div>
            </div>

            {/* Weekly hours panel — aligned with calendar rows */}
            <div>
              {/* Spacer matching month-nav height (≈48px) */}
              <div style={{ height:48 }} />
              {/* Header matching day-names row height (≈18px) */}
              <div style={{ height:18, display:"flex", alignItems:"center", gap:2, marginBottom:4, paddingLeft:30 }}>
                {employees.map(emp => (
                  <div key={emp.id} title={emp.name} style={{ flex:1, textAlign:"center", fontSize:8, color:empColor(emp), fontWeight:700, overflow:"hidden" }}>
                    {emp.name[0]}
                  </div>
                ))}
              </div>
              {/* One row per week */}
              {weeks.map((week, wi) => {
                const weekNum = getISOWeek(new Date(week[0].year, week[0].month, week[0].day));
                return (
                  <div key={wi} style={{ minHeight:80, marginBottom:3, display:"flex", gap:2, alignItems:"flex-start", paddingTop:3 }}>
                    <div style={{ width:28, fontSize:7, color:"#1e3a5f", paddingTop:2, flexShrink:0, textAlign:"center", fontFamily:"monospace" }}>W{weekNum}</div>
                    {employees.map(emp => {
                      let weekH = 0;
                      week.forEach(cell => {
                        const { day, month, year } = cell;
                        const dow2 = new Date(year, month, day).getDay();
                        const mb2  = dow2 === 0 ? 6 : dow2 - 1;
                        const dh2  = dayClinicHours(mb2);
                        if (!dh2) return;
                        const ds2  = dkey(year, month, day);
                        if (!vacations[emp.id]?.[ds2]) weekH += shiftHours(emp.schedule[mb2]);
                      });
                      const hg = clinicConfig.hoursGreen ?? 25;
                      const hr = clinicConfig.hoursRed   ?? 35;
                      const color = weekH === 0 ? "#1e3a5f"
                                  : weekH <= hg ? "#4ade80"
                                  : weekH >  hr ? "#ef4444"
                                  : "#fbbf24";
                      return (
                        <div key={emp.id} style={{ flex:1, textAlign:"center", fontSize:9, fontWeight:700, color, background:`${color}11`, border:`1px solid ${color}22`, borderRadius:4, padding:"3px 1px", lineHeight:"14px" }}>
                          {weekH > 0 ? weekH.toFixed(0) : <span style={{ color:"#1e3a5f" }}>—</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <div style={{ display:"flex", gap:8, marginTop:6, paddingLeft:30, flexWrap:"wrap" }}>
                {[["#4ade80",`≤${clinicConfig.hoursGreen??25}h`],["#fbbf24","medio"],["#ef4444",`>${clinicConfig.hoursRed??35}h`]].map(([c,l]) => (
                  <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
                    <div style={{ width:7,height:7,borderRadius:1,background:c+"88" }} />
                    <span style={{ fontSize:7, color:"#334155" }}>{l}</span>
                  </div>
                ))}
              </div>

              {/* Extra hours summary */}
              {(() => {
                const extraData = weeks.map(week => employees.map(emp => {
                  let extra = 0;
                  week.forEach(cell => {
                    const ds = dkey(cell.year, cell.month, cell.day);
                    const a = dayAssignments[ds];
                    if (!a) return;
                    const assignedId = typeof a === "string" ? a : a.empId;
                    if (assignedId !== emp.id) return;
                    // if marked as rotation, don't count as extra
                    if (typeof a === "object" && a.rotation) return;
                    const dow2 = new Date(cell.year, cell.month, cell.day).getDay();
                    const mb2  = dow2 === 0 ? 6 : dow2 - 1;
                    // if employee normally works that day, not extra
                    if (emp.schedule[mb2]) return;
                    const dh2 = dayClinicHours(mb2);
                    if (!dh2) return;
                    if (typeof a === "object" && a.start && a.end) {
                      extra += (toMin(a.end) - toMin(a.start)) / 60;
                    } else {
                      extra += (dh2.close - dh2.open) / 60;
                    }
                  });
                  return extra;
                }));
                const hasAny = extraData.some(row => row.some(h => h > 0));
                if (!hasAny) return null;
                return (
                  <div style={{ marginTop:14 }}>
                    <div style={{ fontSize:7, letterSpacing:2, color:"#92710a", textTransform:"uppercase", marginBottom:4, paddingLeft:30 }}>Horas extra</div>
                    {weeks.map((week, wi) => {
                      const weekNum = getISOWeek(new Date(week[0].year, week[0].month, week[0].day));
                      const row = extraData[wi];
                      if (row.every(h => h === 0)) return null;
                      return (
                        <div key={wi} style={{ display:"flex", gap:2, marginBottom:3, alignItems:"center" }}>
                          <div style={{ width:28, fontSize:7, color:"#92710a", textAlign:"center", fontFamily:"monospace", flexShrink:0 }}>W{weekNum}</div>
                          {employees.map((emp, ei) => {
                            const h = row[ei];
                            return (
                              <div key={emp.id} style={{ flex:1, textAlign:"center", fontSize:9, fontWeight:700, color: h > 0 ? "#fbbf24" : "#1e3a5f", background: h > 0 ? "rgba(251,191,36,0.12)" : "transparent", border: h > 0 ? "1px solid rgba(251,191,36,0.25)" : "1px solid transparent", borderRadius:4, padding:"3px 1px", lineHeight:"14px" }}>
                                {h > 0 ? `+${h.toFixed(0)}h` : <span style={{ opacity:0.2 }}>—</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── VETCOVERAGE TAB ── */}
        {tab === "coverage" && (
          <div>
            <div style={{ fontSize:8, letterSpacing:4, color:"#334155", textTransform:"uppercase", marginBottom:14 }}>
              Cobertura mensual · {MONTHS[viewMonth]} {viewYear}
            </div>

            {/* Gaps list */}
            {monthlyGaps.length > 0 && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:14, marginBottom:18 }}>
                <div style={{ fontSize:9, color:"#f87171", letterSpacing:2, textTransform:"uppercase", marginBottom:10, fontWeight:700 }}>⚠ Huecos sin veterinario ({monthlyGaps.length})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:300, overflowY:"auto" }}>
                  {monthlyGaps.map((gap, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:gap.isCovered?"rgba(74,222,128,0.1)":"rgba(239,68,68,0.05)", border:`1px solid ${gap.isCovered?"rgba(74,222,128,0.3)":"rgba(239,68,68,0.15)"}`, borderRadius:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, color:"#e2e8f0", fontFamily:"monospace", fontWeight:600 }}>
                          {gap.day} {MONTHS[gap.month]} · {fromMin(gap.startMin)} – {fromMin(gap.endMin)}
                        </div>
                        <div style={{ fontSize:9, color:"#94a3b8", marginTop:2 }}>
                          {(gap.durationMin/60).toFixed(1)}h de hueco {gap.isCovered && <span style={{ color:"#4ade80" }}>(LocumVet cubierto)</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={() => setDetailDay({ dayStr: gap.dayStr, mb: (new Date(gap.year, gap.month, gap.day).getDay() + 6) % 7 })} style={{ background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.18)", color:"#60a5fa", fontSize:10, padding:"5px 10px", borderRadius:6, cursor:"pointer", fontFamily:"monospace" }}>Detalle</button>
                        <button onClick={() => assignDay(gap.dayStr, gap.isCovered ? null : "locumvet")} style={{ background:gap.isCovered?"rgba(248,113,113,0.08)":"rgba(251,191,36,0.08)", border:gap.isCovered?"1px solid rgba(248,113,113,0.18)":"1px solid rgba(251,191,36,0.18)", color:gap.isCovered?"#f87171":"#fbbf24", fontSize:10, padding:"5px 10px", borderRadius:6, cursor:"pointer", fontFamily:"monospace" }}>
                          {gap.isCovered ? "Quitar LocumVet" : "LocumVet"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ overflowX:"auto", paddingBottom:8 }}>
              {/* Week number row */}
              <div style={{ display:"flex", marginLeft:148, marginBottom:1 }}>
                {weeks.map((week, wi) => {
                  const wn = getISOWeek(new Date(week[0].year, week[0].month, week[0].day));
                  return (
                    <div key={wi} style={{ width:7*24, flexShrink:0, borderLeft:"1px solid rgba(255,255,255,0.07)", paddingLeft:3 }}>
                      <span style={{ fontSize:7, color:"#1e3a5f", fontFamily:"monospace" }}>W{wn}</span>
                    </div>
                  );
                })}
              </div>
              {/* Day names row */}
              <div style={{ display:"flex", marginLeft:148 }}>
                {cells.map((cell, i) => {
                  const mb = (new Date(cell.year, cell.month, cell.day).getDay() + 6) % 7;
                  const dh = dayClinicHours(mb);
                  return (
                    <div key={i} style={{ width:22, height:14, flexShrink:0, textAlign:"center", fontSize:7, color:cell.outside?"#1e3a5f":dh?"#475569":"#334155", margin:1, borderLeft:i%7===0?"1px solid rgba(255,255,255,0.07)":"none" }}>
                      {DAYS_SHORT[mb]}
                    </div>
                  );
                })}
              </div>
              {/* Day numbers row */}
              <div style={{ display:"flex", marginLeft:148, marginBottom:8 }}>
                {cells.map((cell, i) => {
                  const isToday2 = cell.year===today.getFullYear()&&cell.month===today.getMonth()&&cell.day===today.getDate();
                  return (
                    <div key={i} style={{ width:22, height:16, flexShrink:0, textAlign:"center", fontSize:8, fontFamily:"monospace", color:cell.outside?"#1e2a3a":isToday2?"#60a5fa":"#334155", margin:1, fontWeight:isToday2?700:400, borderLeft:i%7===0?"1px solid rgba(255,255,255,0.07)":"none" }}>
                      {cell.day}
                    </div>
                  );
                })}
              </div>

              {/* Employee rows */}
              {employees.map(emp => {
                const color = empColor(emp);
                return (
                  <div key={emp.id} style={{ display:"flex", alignItems:"center", marginBottom:3 }}>
                    {/* Label */}
                    <div style={{ width:148, display:"flex", alignItems:"center", gap:7, flexShrink:0, paddingRight:10 }}>
                      <div style={{ width:11, height:11, borderRadius:2, background:color, flexShrink:0 }} />
                      <span style={{ fontSize:11, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{emp.name.split(" ")[0]}</span>
                      <RoleBadge role={emp.role} small />
                    </div>
                    {/* Day cells */}
                    {cells.map((cell, i) => {
                      const { day, month, year, outside } = cell;
                      const dow = new Date(year, month, day).getDay();
                      const mb  = dow === 0 ? 6 : dow - 1;
                      const dh  = dayClinicHours(mb);
                      const ds  = dkey(year, month, day);
                            const assignObj = dayAssignments[ds];
                            const assignedId = assignObj && typeof assignObj === "object" ? assignObj.empId : assignObj;
                            const isAssigned = assignedId === emp.id;
                            const hasShift   = !!emp.schedule[mb] || isAssigned;
                      const isVac      = !!vacations[emp.id]?.[ds];
                      const isToday2   = year===today.getFullYear()&&month===today.getMonth()&&day===today.getDate();

                      let bg = "transparent";
                      if (outside)       { bg = "transparent"; }
                      else if (!dh)      { bg = "rgba(255,255,255,0.02)"; }
                      else if (isVac)    { bg = `${color}35`; }
                      else if (hasShift) { bg = isAssigned ? `${color}99` : color; }

                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (outside) return;
                            if (!dh) return;
                            const isOnVac = !!vacations[emp.id]?.[ds];
                            const assignObj = dayAssignments[ds];
                            const assignedId = assignObj && typeof assignObj === "object" ? assignObj.empId : assignObj;
                            const isAssigned = assignedId === emp.id;
                            const hasNormalSchedule = !!emp.schedule[mb];
                            // Cycle: normal → vacation → (assigned if no schedule) → normal
                            let nextState;
                            if (!isOnVac && !isAssigned) {
                              nextState = "vacation";
                            } else if (isOnVac && !isAssigned) {
                              nextState = !hasNormalSchedule ? "assigned" : "normal";
                            } else if (!isOnVac && isAssigned) {
                              nextState = "normal";
                            } else {
                              nextState = "normal";
                            }
                            // Apply state
                            if (nextState === "vacation") {
                              if (!isOnVac) toggleVacation(emp.id, ds);
                              if (isAssigned) assignDay(ds, null);
                            } else if (nextState === "assigned") {
                              const startStr = fromMin(dh.open);
                              const endStr = fromMin(dh.close);
                              assignDay(ds, { empId: emp.id, start: startStr, end: endStr, rotation: true });
                              if (isOnVac) toggleVacation(emp.id, ds);
                            } else {
                              if (isOnVac) toggleVacation(emp.id, ds);
                              if (isAssigned) assignDay(ds, null);
                            }
                          }}
                          style={{ width:22, height:22, flexShrink:0, borderRadius:3, margin:1, background:bg, opacity:outside?0:1, border: outside?"none": isToday2?"2px solid rgba(96,165,250,0.55)":"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center", boxSizing:"border-box", borderLeft: i%7===0 && !outside ? "2px solid rgba(255,255,255,0.1)" : undefined }}>
                          {!outside && isVac && <span style={{ fontSize:9, lineHeight:1, color:color }}>☀</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* LocumVet row */}
              <div style={{ display:"flex", alignItems:"center", marginBottom:3, borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:8 }}>
                <div style={{ width:148, display:"flex", alignItems:"center", gap:7, flexShrink:0, paddingRight:10 }}>
                  <div style={{ width:11, height:11, borderRadius:2, background:"#fbbf24", flexShrink:0 }} />
                  <span style={{ fontSize:11, color:"#fbbf24", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, fontWeight:600 }}>LocumVet</span>
                </div>
                {cells.map((cell, i) => {
                  const { day, month, year, outside } = cell;
                  const ds = dkey(year, month, day);
                  const isLocumVet = dayAssignments[ds] === "locumvet";
                  const isToday2 = year===today.getFullYear()&&month===today.getMonth()&&day===today.getDate();
                  const bg = isLocumVet ? "rgba(251,191,36,0.3)" : "transparent";
                  return (
                    <div key={i} style={{ width:22, height:22, flexShrink:0, borderRadius:3, margin:1, background:bg, opacity:outside?0:1, border: outside?"none": isToday2?"2px solid rgba(96,165,250,0.55)":"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center", boxSizing:"border-box", borderLeft: i%7===0 && !outside ? "2px solid rgba(255,255,255,0.1)" : undefined }}>
                      {isLocumVet && <span style={{ fontSize:9, lineHeight:1, color:"#fbbf24" }}>✓</span>}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display:"flex", gap:16, marginTop:14, marginLeft:148, flexWrap:"wrap" }}>
                {[["#4ade80","Trabaja"],["#4ade8035","Vacaciones ☀"],["#fbbf2433","LocumVet ✓"],["rgba(255,255,255,0.02)","Clínica cerrada"],["transparent","No trabaja ese día"]].map(([bg, text]) => (
                  <div key={text} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:bg, border:"1px solid rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize:8, color:"#475569" }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STAFF TAB ── */}
        {tab === "staff" && (
          <div style={{ maxWidth:640 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:8, letterSpacing:4, color:"#334155", textTransform:"uppercase" }}>{employees.length} empleados</div>
              <button onClick={() => setEditingEmp({ id:uid(), name:"", role:"veterinario", annualHours:1760, schedule:[...DEFAULT_SCHEDULE] })} style={{ background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.25)", borderRadius:8, color:"#4ade80", fontSize:11, fontFamily:"monospace", padding:"7px 14px", cursor:"pointer", letterSpacing:1 }}>
                + Añadir empleado
              </button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {employees.map(emp => {
                const c         = ROLE_COLORS[emp.role] || "#94a3b8";
                const used      = usedHoursMap[emp.id] || 0;
                const over      = used > emp.annualHours;
                const weekHours = emp.schedule.reduce((a, s) => a + shiftHours(s), 0);
                return (
                  <div key={emp.id} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:38, height:38, borderRadius:"50%", background:`${c}22`, border:`1.5px solid ${c}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:c, fontWeight:700, flexShrink:0 }}>
                        {emp.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, color:"#e2e8f0" }}>{emp.name}</span>
                          <RoleBadge role={emp.role} small />
                        </div>
                        <div style={{ fontSize:9, color:"#334155" }}>
                          {weekHours.toFixed(1)}h/sem · {used.toFixed(0)}/{emp.annualHours}h año{over && <span style={{ color:"#f87171" }}> ⚠</span>}
                        </div>
                        <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                          {emp.schedule.map((s, i) => s ? (
                            <span key={i} style={{ fontSize:8, fontFamily:"monospace", color:c, background:`${c}15`, border:`1px solid ${c}25`, borderRadius:4, padding:"1px 5px" }}>
                              {DAYS_SHORT[i]} {s.start}–{s.end}
                            </span>
                          ) : (
                            <span key={i} style={{ fontSize:8, fontFamily:"monospace", color:"#1e3a5f", padding:"1px 3px" }}>{DAYS_SHORT[i]}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={() => setEditingEmp(emp)} style={{ background:"none", border:"1px solid rgba(96,165,250,0.2)", borderRadius:6, color:"#60a5fa", fontSize:11, width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✎</button>
                        <button onClick={() => deleteEmployee(emp.id)} style={{ background:"none", border:"1px solid rgba(248,113,113,0.2)", borderRadius:6, color:"#f87171", fontSize:11, width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

        {/* ── CLINIC CONFIG TAB ── */}
        {tab === "clinic" && (
          <div style={{ maxWidth:520 }}>
            <div style={{ fontSize:8, letterSpacing:4, color:"#e2e8f0", textTransform:"uppercase", marginBottom:18 }}>Horario de apertura</div>

            {[
              { key:"weekday",  label:"Lunes — Viernes", defaultSlot:{ open:"08:30", close:"19:00" } },
              { key:"saturday", label:"Sábado",           defaultSlot:{ open:"09:00", close:"14:00" } },
              { key:"sunday",   label:"Domingo",          defaultSlot:{ open:"09:00", close:"14:00" } },
            ].map(({ key, label, defaultSlot }) => {
              const val    = clinicConfig[key];
              const isOpen = !!val;
              function updateConfig(next) { setClinicConfig(next); persist({ employees, vacations, clinicConfig:next, dayAssignments, dayOverrides }); }
              return (
                <div key={key} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, marginBottom:8, flexWrap:"wrap" }}>
                  <span style={{ width:140, fontSize:12, color:"#e2e8f0", fontFamily:"monospace" }}>{label}</span>
                  <button
                    onClick={() => updateConfig({ ...clinicConfig, [key]: isOpen ? null : { ...defaultSlot } })}
                    style={{ background:isOpen?"rgba(74,222,128,0.16)":"rgba(255,255,255,0.08)", border:`1px solid ${isOpen?"rgba(74,222,128,0.4)":"rgba(255,255,255,0.14)"}`, borderRadius:6, color:isOpen?"#4ade80":"#cbd5e1", fontSize:10, fontFamily:"monospace", padding:"4px 11px", cursor:"pointer", letterSpacing:1 }}
                  >{isOpen ? "● Abierto" : "○ Cerrado"}</button>
                  {isOpen && (
                    <>
                      <TimeInput value={val.open}  onChange={v => updateConfig({ ...clinicConfig, [key]:{ ...val, open:v  } })} color="#4ade80" />
                      <span style={{ color:"#334155", fontSize:13 }}>—</span>
                      <TimeInput value={val.close} onChange={v => updateConfig({ ...clinicConfig, [key]:{ ...val, close:v } })} color="#4ade80" />
                    </>
                  )}
                </div>
              );
            })}

            <div style={{ marginTop:24, fontSize:8, letterSpacing:4, color:"#e2e8f0", textTransform:"uppercase", marginBottom:14 }}>Semáforo horas / semana</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {[
                { key:"hoursGreen", label:"Verde si ≤", color:"#4ade80" },
                { key:"hoursRed",   label:"Rojo si >",  color:"#ef4444" },
              ].map(({ key, label, color }) => (
                <div key={key} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:`${color}22`, border:`1px solid ${color}44`, borderRadius:10, flex:1, minWidth:140 }}>
                  <span style={{ fontSize:11, color:"#e2e8f0", fontFamily:"monospace", flex:1 }}>{label}</span>
                  <input
                    type="number" min="0" max="80"
                    value={clinicConfig[key] ?? (key === "hoursGreen" ? 25 : 35)}
                    onChange={e => {
                      const next = { ...clinicConfig, [key]: Math.max(0, Number(e.target.value)) };
                      setClinicConfig(next);
                      persist({ employees, vacations, clinicConfig: next, dayAssignments, dayOverrides });
                    }}
                    style={{ width:52, background:`${color}22`, border:`1px solid ${color}55`, borderRadius:6, color, fontSize:13, fontFamily:"monospace", padding:"4px 7px", outline:"none" }}
                  />
                  <span style={{ fontSize:11, color:`${color}88` }}>h</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop:24, fontSize:8, letterSpacing:4, color:"#334155", textTransform:"uppercase", marginBottom:14 }}>Veterinario externo</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(251,191,36,0.12)", border:"1px solid rgba(251,191,36,0.30)", borderRadius:10 }}>
              <span style={{ fontSize:12, color:"#92710a", fontFamily:"monospace", flex:1 }}>Tarifa hora</span>
              <input
                type="number" min="0" value={extRate}
                onChange={e => setExtRate(Math.max(0, Number(e.target.value)))}
                style={{ width:70, background:"rgba(251,191,36,0.18)", border:"1px solid rgba(251,191,36,0.35)", borderRadius:6, color:"#fbbf24", fontSize:13, fontFamily:"monospace", padding:"5px 8px", outline:"none" }}
              />
              <span style={{ fontSize:12, color:"#78560a", fontFamily:"monospace" }}>€/h</span>
            </div>
          </div>
        )}

      {gapAlert && (
        <Modal title={`Huecos · ${gapAlert.day}`} onClose={() => setGapAlert(null)}>
          <div style={{ fontSize:13, color:"#e2e8f0", marginBottom:8 }}>{gapAlert.empName}</div>
          <div style={{ fontSize:13, color: gapAlert.added > 0 ? "#fbbf24" : "#4ade80", marginBottom:8 }}>
            {gapAlert.added > 0 ? `Se han creado ${ (gapAlert.added/60).toFixed(1) } h de hueco` : gapAlert.removed > 0 ? `Se han reducido ${ (gapAlert.removed/60).toFixed(1) } h de hueco` : "Sin cambios"}
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:10, color:"#94a3b8", marginBottom:6 }}>Detalle de huecos (después)</div>
            {(gapAlert.gapsAfter || []).length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(gapAlert.gapsAfter || []).map((g, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                    <span>{fromMin(g.startMin)} → {fromMin(g.endMin)}</span>
                    <span style={{ color:"#fbbf24" }}>{((g.endMin - g.startMin)/60).toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize:11, color:"#475569" }}>No hay huecos tras el cambio.</div>
            )}
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
            <button onClick={() => { const dow = new Date(gapAlert.day).getDay(); const mb = dow===0?6:dow-1; setDetailDay({ dayStr: gapAlert.day, mb }); setGapAlert(null); }} style={{ background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.15)", color:"#60a5fa", padding:"6px 10px", borderRadius:8 }}>Ver detalle</button>
            <button onClick={() => setGapAlert(null)} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#94a3b8", padding:"6px 10px", borderRadius:8 }}>Cerrar</button>
          </div>
        </Modal>
      )}
      {editingEmp && <EmployeeModal emp={editingEmp} onSave={saveEmployee} onClose={() => setEditingEmp(null)} />}
      {detailDay  && (() => { const dh = dayClinicHours(detailDay.mb); const overrides = dayOverrides[detailDay.dayStr] || {}; return <DayDetail dayStr={detailDay.dayStr} dayOfWeek={detailDay.mb} employees={employees} vacations={vacations} onClose={() => setDetailDay(null)} clinicOpen={dh?.open} clinicClose={dh?.close} dayAssignment={dayAssignments[detailDay.dayStr]} dayOverrides={overrides} onAssign={empId => assignDay(detailDay.dayStr, empId)} onOverride={(empId, ov) => updateDayOverride(detailDay.dayStr, empId, ov)} onToggleVacation={toggleVacation} />; })()}
    </div>
  );
}
