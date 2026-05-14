import { useState, useMemo, useEffect, useRef } from "react";
import { MONTHS, DAYS_SHORT, ROLE_COLORS, DEFAULT_SCHEDULE, SAMPLE_EMPLOYEES } from "./constants/index.js";
import { getDaysInMonth, getFirstDow, dkey, parseDkey, uid } from "./utils/calendar.js";
import { shiftHours } from "./utils/time.js";
import { getWorkingSlots, getCoverageGaps } from "./utils/coverage.js";
import { useStorage } from "./hooks/useStorage.js";
import CoverageTimeline from "./components/CoverageTimeline.jsx";
import EmployeeModal    from "./components/EmployeeModal.jsx";
import DayDetail        from "./components/DayDetail.jsx";
import YearMini         from "./components/YearMini.jsx";
import RoleBadge        from "./components/RoleBadge.jsx";

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

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!initialData) return;
    if (Array.isArray(initialData.employees) && initialData.employees.length) setEmployees(initialData.employees);
    if (initialData.vacations && typeof initialData.vacations === "object") setVacations(initialData.vacations);
  }, [initialData]);

  function saveEmployee(emp) {
    const next = employees.some(e => e.id === emp.id)
      ? employees.map(e => e.id === emp.id ? emp : e)
      : [...employees, emp];
    setEmployees(next);
    persist({ employees:next, vacations });
    setEditingEmp(null);
  }

  function deleteEmployee(id) {
    const next = employees.filter(e => e.id !== id);
    const vacs = { ...vacations };
    delete vacs[id];
    setEmployees(next);
    setVacations(vacs);
    if (selectedEmp === id) setSelectedEmp(null);
    persist({ employees:next, vacations:vacs });
  }

  function toggleVacation(empId, day) {
    const ev   = { ...(vacations[empId] || {}) };
    if (ev[day]) delete ev[day]; else ev[day] = true;
    const next = { ...vacations, [empId]:ev };
    setVacations(next);
    persist({ employees, vacations:next });
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
        persist({ employees:data.employees, vacations:data.vacations || {} });
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

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  const dim   = getDaysInMonth(viewYear, viewMonth);
  const fd    = getFirstDow(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < fd; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  const saveLabel = saveStatus === "saving" ? "● GUARDANDO…" : saveStatus === "nostorage" ? "○ SIN ALMACENAMIENTO" : "● GUARDADO";
  const saveColor = saveStatus === "saving" ? "#fbbf24" : saveStatus === "nostorage" ? "#475569" : "#1a4030";

  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:"#070e18", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontFamily:"monospace", fontSize:11, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase" }}>Cargando…</span>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#070e18", color:"#e2e8f0", fontFamily:"monospace", padding:"20px 16px" }}>
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
              {[["calendar","📅 Calendario"],["staff","👥 Empleados"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.08)":"none", border:tab===t?"1px solid rgba(255,255,255,0.1)":"1px solid transparent", borderRadius:7, padding:"6px 14px", cursor:"pointer", color:tab===t?"#e2e8f0":"#475569", fontSize:11, fontFamily:"monospace", letterSpacing:1 }}>{l}</button>
              ))}
            </div>

            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <button onClick={exportState} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#4ade80", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}>↓ Exportar JSON</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#60a5fa", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}>↑ Importar JSON</button>
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
          <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:18, alignItems:"start" }}>

            {/* Left panel */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:8, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase", marginBottom:2 }}>Selecciona empleado</div>
              {employees.map(emp => {
                const isSel = selectedEmp === emp.id;
                const c     = ROLE_COLORS[emp.role] || "#94a3b8";
                const used  = usedHoursMap[emp.id] || 0;
                const over  = used > emp.annualHours;
                return (
                  <div key={emp.id} onClick={() => setSelectedEmp(isSel ? null : emp.id)} style={{ background:isSel?`${c}18`:"rgba(255,255,255,0.03)", border:`1px solid ${isSel?c+"44":"rgba(255,255,255,0.06)"}`, borderRadius:10, padding:"9px 11px", cursor:"pointer", transition:"all 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:"50%", background:`${c}22`, border:`1.5px solid ${c}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:c, fontWeight:700 }}>
                          {emp.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                        </div>
                        <span style={{ fontSize:11, color:isSel?"#f1f5f9":"#94a3b8" }}>{emp.name.split(" ")[0]}</span>
                      </div>
                      <RoleBadge role={emp.role} small />
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

              <div style={{ marginTop:6 }}>
                <button onClick={() => setShowYear(v => !v)} style={{ background:"none", border:"none", cursor:"pointer", color:"#1e3a5f", fontSize:8, letterSpacing:3, textTransform:"uppercase", fontFamily:"monospace", marginBottom:6, padding:0 }}>
                  {showYear ? "▼" : "▶"} Vista anual
                </button>
                {showYear && <YearMini year={viewYear} employees={employees} vacations={vacations} today={today} onNavigate={m => setViewMonth(m)} viewMonth={viewMonth} />}
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

              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:4 }}>
                {DAYS_SHORT.map(d => <div key={d} style={{ textAlign:"center", fontSize:8, color:"#1e3a5f", letterSpacing:2, padding:"3px 0" }}>{d}</div>)}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const dayStr    = dkey(viewYear, viewMonth, day);
                  const dow       = new Date(viewYear, viewMonth, day).getDay();
                  const mb        = dow === 0 ? 6 : dow - 1;
                  const isWknd    = mb >= 5;
                  const isToday   = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
                  const onVac     = employees.filter(e => vacations[e.id]?.[dayStr]);
                  const selOnVac  = selectedEmp && vacations[selectedEmp]?.[dayStr];
                  const slots     = isWknd ? [] : getWorkingSlots(mb, employees, vacations, dayStr);
                  const gaps      = isWknd ? [] : getCoverageGaps(slots);
                  const hasGap    = gaps.length > 0;
                  const selColor  = ROLE_COLORS[employees.find(e => e.id === selectedEmp)?.role] || "#60a5fa";

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
                          <CoverageTimeline dayOfWeek={mb} employees={employees} vacations={vacations} dayStr={dayStr} compact={true} />
                        </div>
                      )}
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

      {editingEmp && <EmployeeModal emp={editingEmp} onSave={saveEmployee} onClose={() => setEditingEmp(null)} />}
      {detailDay  && <DayDetail dayStr={detailDay.dayStr} dayOfWeek={detailDay.mb} employees={employees} vacations={vacations} onClose={() => setDetailDay(null)} />}
    </div>
  );
}
