import { useState, useMemo, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["L","M","X","J","V","S","D"];
const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const STORAGE_KEY = "clinic-v2";
const SHARED = true;

// Clinic open window (minutes from midnight)
const CLINIC_OPEN  = 8 * 60 + 30;  // 08:30
const CLINIC_CLOSE = 19 * 60;       // 19:00
const CLINIC_SPAN  = CLINIC_CLOSE - CLINIC_OPEN; // 630 min

const ROLE_COLORS = { veterinario:"#4ade80", auxiliar:"#60a5fa", recepcion:"#f472b6", jefe:"#fbbf24" };
const ROLE_LABELS = { veterinario:"Veterinario", auxiliar:"Auxiliar", recepcion:"Recepción", jefe:"Jefe" };

// Default schedule: each day has { start, end } in "HH:MM" or null if not working
const DEFAULT_DAY_SHIFT = { start:"09:00", end:"17:00" };
const DEFAULT_SCHEDULE = [
  { start:"09:00", end:"17:00" }, // Mon
  { start:"09:00", end:"17:00" }, // Tue
  { start:"09:00", end:"17:00" }, // Wed
  { start:"09:00", end:"17:00" }, // Thu
  { start:"09:00", end:"17:00" }, // Fri
  null, // Sat
  null, // Sun
];

const SAMPLE_EMPLOYEES = [
  { id:"e1", name:"Carlos Ruiz",   role:"veterinario", annualHours:1760, schedule:[
    {start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"14:00"},null,null] },
  { id:"e2", name:"Marta López",   role:"veterinario", annualHours:1760, schedule:[
    {start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},null,null] },
  { id:"e3", name:"Sofía García",  role:"auxiliar",    annualHours:1760, schedule:[
    {start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},null,null] },
  { id:"e4", name:"Pedro Sánchez", role:"recepcion",   annualHours:1760, schedule:[
    {start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},null,null] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
function getFirstDow(y, m)    { const d = new Date(y,m,1).getDay(); return d===0?6:d-1; }
function dkey(y, m, d)        { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function parseDkey(k)         { const [y,m,d]=k.split("-").map(Number); return {y,m:m-1,d}; }
function uid()                { return Math.random().toString(36).slice(2,9); }

// "HH:MM" → minutes from midnight
function toMin(t) {
  if (!t) return null;
  const [h,m] = t.split(":").map(Number);
  return h*60+m;
}
// minutes → "HH:MM"
function fromMin(m) {
  const h = Math.floor(m/60);
  const mm = m%60;
  return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}
// Shift duration in hours
function shiftHours(shift) {
  if (!shift || !shift.start || !shift.end) return 0;
  return Math.max(0, (toMin(shift.end) - toMin(shift.start)) / 60);
}

// For a given day, return array of { empId, role, startMin, endMin } for employees working (not on vacation)
function getWorkingSlots(dayOfWeek, employees, vacations, dayStr) {
  return employees
    .filter(e => {
      const shift = e.schedule[dayOfWeek];
      return shift && shift.start && shift.end && !vacations[e.id]?.[dayStr];
    })
    .map(e => {
      const shift = e.schedule[dayOfWeek];
      return { empId: e.id, name: e.name, role: e.role, startMin: toMin(shift.start), endMin: toMin(shift.end) };
    });
}

// Returns array of { start, end, covered } gaps in coverage relative to clinic hours
// covered = number of vets covering that minute range
function getCoverageGaps(slots) {
  const vets = slots.filter(s => s.role === "veterinario");
  const gaps = []; // minutes without any vet
  for (let t = CLINIC_OPEN; t < CLINIC_CLOSE; t++) {
    const covered = vets.some(v => v.startMin <= t && v.endMin > t);
    if (!covered) gaps.push(t);
  }
  if (gaps.length === 0) return [];
  // Merge consecutive minutes into ranges
  const ranges = [];
  let start = gaps[0];
  for (let i = 1; i <= gaps.length; i++) {
    if (i === gaps.length || gaps[i] !== gaps[i-1]+1) {
      ranges.push({ startMin: start, endMin: gaps[i-1]+1 });
      start = gaps[i];
    }
  }
  return ranges;
}

// ── Coverage Timeline Component ───────────────────────────────────────────────
function CoverageTimeline({ dayOfWeek, employees, vacations, dayStr, compact }) {
  const slots = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);
  const gaps  = getCoverageGaps(slots);
  const hasGap = gaps.length > 0;

  // px per minute ratio
  const W = compact ? 120 : 320;
  const ratio = W / CLINIC_SPAN;

  // Time axis ticks every 2 hours
  const ticks = [];
  for (let t = CLINIC_OPEN; t <= CLINIC_CLOSE; t += 120) ticks.push(t);

  if (compact) {
    // Minimal version for calendar cell
    return (
      <div style={{ position:"relative", height:6, background:"rgba(255,255,255,0.04)", borderRadius:3, overflow:"hidden" }}>
        {/* Employee bars */}
        {slots.map(s => {
          const x = (s.startMin - CLINIC_OPEN) * ratio;
          const w = (s.endMin - s.startMin) * ratio;
          const c = ROLE_COLORS[s.role] || "#94a3b8";
          return <div key={s.empId} style={{ position:"absolute", top:0, left:x, width:w, height:"100%", background:c+"88", borderRadius:1 }} />;
        })}
        {/* Gap overlay */}
        {gaps.map((g,i) => {
          const x = (g.startMin - CLINIC_OPEN) * ratio;
          const w = (g.endMin - g.startMin) * ratio;
          return <div key={i} style={{ position:"absolute", top:0, left:x, width:Math.max(w,2), height:"100%", background:"rgba(239,68,68,0.7)", borderRadius:1 }} />;
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Time axis */}
      <div style={{ position:"relative", height:14, marginBottom:2 }}>
        {ticks.map(t => (
          <div key={t} style={{ position:"absolute", left:(t-CLINIC_OPEN)*ratio, fontSize:7, color:"#334155", fontFamily:"monospace", transform:"translateX(-50%)" }}>
            {fromMin(t)}
          </div>
        ))}
      </div>

      {/* Background track */}
      <div style={{ position:"relative", background:"rgba(255,255,255,0.04)", borderRadius:6, overflow:"visible", marginBottom:4 }}>
        {/* Grid lines */}
        {ticks.map(t => (
          <div key={t} style={{ position:"absolute", left:(t-CLINIC_OPEN)*ratio, top:0, bottom:0, width:1, background:"rgba(255,255,255,0.04)" }} />
        ))}

        {/* Employee rows */}
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
                  <div title={`${s.name}: ${fromMin(s.startMin)}–${fromMin(s.endMin)}`} style={{
                    position:"absolute", left:x, width:Math.max(w,4), height:"100%",
                    background:`linear-gradient(90deg,${c}55,${c}88)`,
                    border:`1px solid ${c}44`,
                    borderRadius:3,
                    display:"flex", alignItems:"center", overflow:"hidden",
                  }}>
                    <span style={{ fontSize:7, color:c, fontFamily:"monospace", paddingLeft:3, whiteSpace:"nowrap", overflow:"hidden" }}>
                      {s.name.split(" ")[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Gap highlights */}
        {gaps.map((g,i) => {
          const x = (g.startMin - CLINIC_OPEN) * ratio;
          const w = (g.endMin - g.startMin) * ratio;
          return (
            <div key={i} title={`Sin vet: ${fromMin(g.startMin)}–${fromMin(g.endMin)}`} style={{
              position:"absolute", left:x, top:0, bottom:0, width:Math.max(w,3),
              background:"rgba(239,68,68,0.12)",
              borderLeft:"2px solid rgba(239,68,68,0.5)",
              borderRight:w>3?"2px solid rgba(239,68,68,0.5)":undefined,
              pointerEvents:"none",
            }} />
          );
        })}
      </div>

      {/* Gap labels */}
      {hasGap && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {gaps.map((g,i) => (
            <span key={i} style={{ fontSize:9, color:"#f87171", fontFamily:"monospace", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, padding:"1px 5px" }}>
              ⚠ {fromMin(g.startMin)}–{fromMin(g.endMin)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Time Input ────────────────────────────────────────────────────────────────
function TimeInput({ value, onChange, color }) {
  return (
    <input type="time" value={value || ""} onChange={e => onChange(e.target.value)}
      style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${color}33`, borderRadius:6, padding:"4px 6px", color: value ? color : "#334155", fontSize:12, fontFamily:"monospace", outline:"none", width:90 }}
    />
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#0a1628", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, padding:24, width:"100%", maxWidth:520, boxShadow:"0 24px 64px rgba(0,0,0,0.6)", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:13, color:"#e2e8f0", fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Employee Edit Modal ───────────────────────────────────────────────────────
function EmployeeModal({ emp, onSave, onClose }) {
  const isNew = !emp || !emp.name;
  const [form, setForm] = useState(isNew
    ? { id:uid(), name:"", role:"veterinario", annualHours:1760, schedule:[...DEFAULT_SCHEDULE] }
    : { ...emp, schedule: emp.schedule.map(s => s ? {...s} : null) }
  );

  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  function setShift(dow, field, val) {
    setForm(f => {
      const sched = f.schedule.map((s,i) => i===dow ? (s ? {...s,[field]:val} : {...DEFAULT_DAY_SHIFT,[field]:val}) : s);
      return {...f, schedule:sched};
    });
  }
  function toggleDay(dow) {
    setForm(f => {
      const sched = [...f.schedule];
      sched[dow] = sched[dow] ? null : {...DEFAULT_DAY_SHIFT};
      return {...f, schedule:sched};
    });
  }

  const totalHours = form.schedule.reduce((acc,s) => acc + shiftHours(s), 0);

  return (
    <Modal title={isNew ? "Nuevo empleado" : "Editar empleado"} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <label style={labelSt}>
          Nombre
          <input value={form.name} onChange={e => set("name",e.target.value)} style={inputSt} placeholder="Nombre completo" />
        </label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <label style={labelSt}>
            Rol
            <select value={form.role} onChange={e => set("role",e.target.value)} style={inputSt}>
              {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={labelSt}>
            Horas anuales
            <input type="number" value={form.annualHours} onChange={e => set("annualHours",Number(e.target.value))} style={inputSt} />
          </label>
        </div>

        {/* Schedule */}
        <div style={labelSt}>
          Horario semanal
          <div style={{ fontSize:9, color:"#334155", marginBottom:6 }}>Semana típica · {totalHours.toFixed(1)}h/semana</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {DAYS_FULL.map((day, i) => {
              const shift = form.schedule[i];
              const isWknd = i >= 5;
              const color = ROLE_COLORS[form.role] || "#94a3b8";
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, opacity: isWknd && !shift ? 0.3 : 1 }}>
                  <button onClick={() => toggleDay(i)} style={{
                    width:52, padding:"3px 0", fontSize:9, fontFamily:"monospace",
                    background: shift ? `${color}22` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${shift ? color+"44" : "rgba(255,255,255,0.08)"}`,
                    borderRadius:5, color: shift ? color : "#475569", cursor:"pointer", letterSpacing:1,
                  }}>{DAYS_SHORT[i]}{shift ? "" : " —"}</button>
                  {shift ? (
                    <>
                      <TimeInput value={shift.start} onChange={v => setShift(i,"start",v)} color={color} />
                      <span style={{ fontSize:10, color:"#334155" }}>→</span>
                      <TimeInput value={shift.end} onChange={v => setShift(i,"end",v)} color={color} />
                      <span style={{ fontSize:9, color:"#334155", fontFamily:"monospace" }}>{shiftHours(shift).toFixed(1)}h</span>
                    </>
                  ) : (
                    <span style={{ fontSize:9, color:"#1e3a5f", fontFamily:"monospace" }}>No trabaja</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:6 }}>
          <button onClick={onClose} style={cancelBtnSt}>Cancelar</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={saveBtnSt}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}

const labelSt = { display:"flex", flexDirection:"column", gap:6, fontSize:9, color:"#475569", fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase" };
const inputSt = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"8px 10px", color:"#e2e8f0", fontSize:13, fontFamily:"monospace", outline:"none", width:"100%", boxSizing:"border-box" };
const saveBtnSt   = { flex:1, background:"rgba(96,165,250,0.15)", border:"1px solid rgba(96,165,250,0.3)", borderRadius:8, padding:"10px", color:"#60a5fa", fontSize:11, fontFamily:"monospace", cursor:"pointer", letterSpacing:1 };
const cancelBtnSt = { flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"10px", color:"#475569", fontSize:11, fontFamily:"monospace", cursor:"pointer", letterSpacing:1 };

function RoleBadge({ role, small }) {
  const c = ROLE_COLORS[role] || "#94a3b8";
  return <span style={{ display:"inline-block", background:c+"22", border:`1px solid ${c}55`, color:c, borderRadius:4, padding:small?"1px 5px":"2px 8px", fontSize:small?8:10, fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase" }}>{ROLE_LABELS[role]||role}</span>;
}

// ── Year mini overview ────────────────────────────────────────────────────────
function YearMini({ year, employees, vacations, today, onNavigate, viewMonth }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:12, padding:"14px 12px" }}>
      <div style={{ fontSize:8, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase", fontFamily:"monospace", textAlign:"center", marginBottom:12 }}>Vista anual · {year}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7 }}>
        {Array.from({length:12},(_,mi) => {
          const dim = getDaysInMonth(year,mi);
          const fd  = getFirstDow(year,mi);
          const isCur = mi === viewMonth;
          let vacDays=0, gapDays=0;
          for (let d=1;d<=dim;d++) {
            const dow = new Date(year,mi,d).getDay();
            const mb  = dow===0?6:dow-1;
            if (mb>=5) continue;
            const ds = dkey(year,mi,d);
            if (employees.some(e=>vacations[e.id]?.[ds])) vacDays++;
            const slots = getWorkingSlots(mb, employees, vacations, ds);
            if (getCoverageGaps(slots).length>0) gapDays++;
          }
          const cells=[];
          for(let i=0;i<fd;i++) cells.push(null);
          for(let d=1;d<=dim;d++) cells.push(d);
          return (
            <div key={mi} onClick={()=>onNavigate(mi)} style={{ cursor:"pointer", background:isCur?"rgba(96,165,250,0.08)":"rgba(255,255,255,0.02)", border:`1px solid ${isCur?"rgba(96,165,250,0.2)":"rgba(255,255,255,0.04)"}`, borderRadius:7, padding:"5px 4px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                <span style={{ fontSize:7, color:isCur?"#60a5fa":"#334155", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:1 }}>{MONTHS[mi].slice(0,3)}</span>
                <div style={{ display:"flex", gap:2 }}>
                  {vacDays>0&&<span style={{ fontSize:6, color:"#fbbf24" }}>{vacDays}</span>}
                  {gapDays>0&&<span style={{ fontSize:6, color:"#f87171" }}>⚠{gapDays}</span>}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
                {cells.map((day,i) => {
                  if (!day) return <div key={`e${i}`} style={{height:4}} />;
                  const dow = new Date(year,mi,day).getDay();
                  const mb  = dow===0?6:dow-1;
                  const isW = mb>=5;
                  const ds  = dkey(year,mi,day);
                  const hasVac = employees.some(e=>vacations[e.id]?.[ds]);
                  const slots  = isW?[]:getWorkingSlots(mb,employees,vacations,ds);
                  const hasGap = !isW && getCoverageGaps(slots).length>0;
                  const isT    = year===today.getFullYear()&&mi===today.getMonth()&&day===today.getDate();
                  return <div key={day} style={{ height:4, borderRadius:1, background: hasGap?"#ef444477":hasVac?"#fbbf2455":isT?"#60a5fa88":isW?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.07)" }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:10, justifyContent:"center" }}>
        {[["#fbbf24","Vacaciones"],["#ef4444","Hueco cobertura"],["#60a5fa","Hoy"]].map(([c,l])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <div style={{ width:7, height:4, borderRadius:1, background:c+"88" }} />
            <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day Detail Modal ──────────────────────────────────────────────────────────
function DayDetail({ dayStr, dayOfWeek, employees, vacations, onClose }) {
  const slots = getWorkingSlots(dayOfWeek, employees, vacations, dayStr);
  const gaps  = getCoverageGaps(slots);
  const {y,m,d} = parseDkey(dayStr);
  const label = `${d} de ${MONTHS[m]} de ${y}`;

  return (
    <Modal title={label} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {/* Full timeline */}
        <div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:8 }}>Cobertura del día</div>
          <CoverageTimeline dayOfWeek={dayOfWeek} employees={employees} vacations={vacations} dayStr={dayStr} compact={false} />
        </div>

        {/* Who's working */}
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

        {/* Who's on vacation */}
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

        {gaps.length > 0 && (
          <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8 }}>
            <div style={{ fontSize:9, color:"#f87171", letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace", marginBottom:6 }}>⚠ Franjas sin veterinario</div>
            {gaps.map((g,i) => (
              <div key={i} style={{ fontSize:11, color:"#fca5a5", fontFamily:"monospace" }}>
                {fromMin(g.startMin)} → {fromMin(g.endMin)} ({((g.endMin-g.startMin)/60).toFixed(1)}h)
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();
  const [loaded,      setLoaded]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState("saved");
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

  const saveTimer  = useRef(null);
  const storageOk  = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      try { if (window.storage && typeof window.storage.get==="function") storageOk.current=true; } catch(_){}
      if (!storageOk.current) { setSaveStatus("nostorage"); setLoaded(true); return; }
      try {
        const r = await window.storage.get(STORAGE_KEY, SHARED);
        if (r?.value) {
          const s = JSON.parse(r.value);
          if (Array.isArray(s.employees)&&s.employees.length) setEmployees(s.employees);
          if (s.vacations&&typeof s.vacations==="object") setVacations(s.vacations);
        }
      } catch(_) {}
      setLoaded(true);
    }
    load();
  }, []);

  function persist(emps, vacs) {
    if (!storageOk.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify({employees:emps,vacations:vacs}), SHARED); setSaveStatus("saved"); }
      catch(_) { setSaveStatus("nostorage"); }
    }, 700);
  }

  function saveEmployee(emp) {
    const next = employees.some(e=>e.id===emp.id) ? employees.map(e=>e.id===emp.id?emp:e) : [...employees,emp];
    setEmployees(next); persist(next,vacations); setEditingEmp(null);
  }
  function deleteEmployee(id) {
    const next = employees.filter(e=>e.id!==id);
    const vacs = {...vacations}; delete vacs[id];
    setEmployees(next); setVacations(vacs);
    if (selectedEmp===id) setSelectedEmp(null);
    persist(next,vacs);
  }
  function toggleVacation(empId, day) {
    const ev = {...(vacations[empId]||{})};
    if (ev[day]) delete ev[day]; else ev[day]=true;
    const next = {...vacations,[empId]:ev};
    setVacations(next); persist(employees,next);
  }

  // ── Export / Import ──────────────────────────────────────────────────────────
  function exportState() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      employees,
      vacations,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `clinica-vacaciones-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.employees)) throw new Error("Formato inválido");
        setEmployees(data.employees);
        setVacations(data.vacations || {});
        setSelectedEmp(null);
        persist(data.employees, data.vacations || {});
        setImportMsg({ ok: true, text: `✓ Cargado: ${data.employees.length} empleados` });
      } catch (err) {
        setImportMsg({ ok: false, text: `✕ Error: ${err.message}` });
      }
      setTimeout(() => setImportMsg(null), 3500);
    };
    reader.readAsText(file);
  }

  const usedHoursMap = useMemo(() => {
    const map = {};
    employees.forEach(emp => {
      let h = 0;
      Object.keys(vacations[emp.id]||{}).forEach(k => {
        const {y,m,d} = parseDkey(k);
        const dow = new Date(y,m,d).getDay();
        const mb  = dow===0?6:dow-1;
        h += shiftHours(emp.schedule[mb]);
      });
      map[emp.id] = h;
    });
    return map;
  }, [employees, vacations]);

  function prevMonth() { if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }
  function nextMonth() { if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }

  const dim = getDaysInMonth(viewYear, viewMonth);
  const fd  = getFirstDow(viewYear, viewMonth);
  const cells = [];
  for(let i=0;i<fd;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);

  const saveLabel = saveStatus==="saving"?"● GUARDANDO…":saveStatus==="nostorage"?"○ SIN ALMACENAMIENTO":"● GUARDADO";
  const saveColor = saveStatus==="saving"?"#fbbf24":saveStatus==="nostorage"?"#475569":"#1a4030";

  if (!loaded) return (
    <div style={{minHeight:"100vh",background:"#070e18",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontFamily:"monospace",fontSize:11,letterSpacing:4,color:"#1e3a5f",textTransform:"uppercase"}}>Cargando…</span>
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
            {/* Tabs */}
            <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:4 }}>
              {[["calendar","📅 Calendario"],["staff","👥 Empleados"]].map(([t,l])=>(
                <button key={t} onClick={()=>setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.08)":"none", border:tab===t?"1px solid rgba(255,255,255,0.1)":"1px solid transparent", borderRadius:7, padding:"6px 14px", cursor:"pointer", color:tab===t?"#e2e8f0":"#475569", fontSize:11, fontFamily:"monospace", letterSpacing:1 }}>{l}</button>
              ))}
            </div>

            {/* Export / Import */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <button
                onClick={exportState}
                style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#4ade80", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}
              >↓ Exportar JSON</button>

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:7, padding:"5px 11px", cursor:"pointer", color:"#60a5fa", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}
              >↑ Importar JSON</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display:"none" }}
                onChange={e => { importState(e.target.files[0]); e.target.value = ""; }}
              />

              {importMsg && (
                <span style={{ fontSize:9, fontFamily:"monospace", color: importMsg.ok ? "#4ade80" : "#f87171", background: importMsg.ok ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)", border:`1px solid ${importMsg.ok?"rgba(74,222,128,0.2)":"rgba(239,68,68,0.2)"}`, borderRadius:6, padding:"4px 8px" }}>
                  {importMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── CALENDAR TAB ── */}
        {tab==="calendar" && (
          <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:18, alignItems:"start" }}>

            {/* Left panel */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:8, letterSpacing:4, color:"#1e3a5f", textTransform:"uppercase", marginBottom:2 }}>Selecciona empleado</div>
              {employees.map(emp => {
                const isSel = selectedEmp===emp.id;
                const c = ROLE_COLORS[emp.role]||"#94a3b8";
                const used = usedHoursMap[emp.id]||0;
                const over = used>emp.annualHours;
                return (
                  <div key={emp.id} onClick={()=>setSelectedEmp(isSel?null:emp.id)} style={{ background:isSel?`${c}18`:"rgba(255,255,255,0.03)", border:`1px solid ${isSel?c+"44":"rgba(255,255,255,0.06)"}`, borderRadius:10, padding:"9px 11px", cursor:"pointer", transition:"all 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:"50%", background:`${c}22`, border:`1.5px solid ${c}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:c, fontWeight:700 }}>
                          {emp.name.split(" ").map(w=>w[0]).slice(0,2).join("")}
                        </div>
                        <span style={{ fontSize:11, color:isSel?"#f1f5f9":"#94a3b8" }}>{emp.name.split(" ")[0]}</span>
                      </div>
                      <RoleBadge role={emp.role} small />
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:2, height:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min((used/(emp.annualHours||1))*100,100)}%`, background:over?"#ef4444":c, borderRadius:2, transition:"width 0.3s" }} />
                    </div>
                    <div style={{ fontSize:8, color:"#334155", marginTop:3 }}>
                      <span style={{ color:over?"#f87171":"#475569" }}>{used.toFixed(0)}h</span>/{emp.annualHours}h{over&&<span style={{ color:"#f87171" }}> ⚠</span>}
                    </div>
                  </div>
                );
              })}

              {selectedEmp && (
                <div style={{ padding:"8px 10px", background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.15)", borderRadius:8 }}>
                  <div style={{ fontSize:8, color:"#60a5fa", letterSpacing:1, marginBottom:3 }}>MODO EDICIÓN</div>
                  <div style={{ fontSize:9, color:"#475569" }}>Clic en día → marcar vacaciones de <span style={{ color:"#94a3b8" }}>{employees.find(e=>e.id===selectedEmp)?.name.split(" ")[0]}</span></div>
                  <button onClick={()=>setSelectedEmp(null)} style={{ marginTop:7, background:"none", border:"1px solid rgba(255,255,255,0.07)", borderRadius:5, color:"#475569", fontSize:8, padding:"3px 8px", cursor:"pointer", fontFamily:"monospace" }}>Deseleccionar</button>
                </div>
              )}

              {/* Year overview */}
              <div style={{ marginTop:6 }}>
                <button onClick={()=>setShowYear(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", color:"#1e3a5f", fontSize:8, letterSpacing:3, textTransform:"uppercase", fontFamily:"monospace", marginBottom:6, padding:0 }}>
                  {showYear?"▼":"▶"} Vista anual
                </button>
                {showYear && <YearMini year={viewYear} employees={employees} vacations={vacations} today={today} onNavigate={m=>setViewMonth(m)} viewMonth={viewMonth} />}
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
                {DAYS_SHORT.map(d=><div key={d} style={{ textAlign:"center", fontSize:8, color:"#1e3a5f", letterSpacing:2, padding:"3px 0" }}>{d}</div>)}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                {cells.map((day,i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const dayStr = dkey(viewYear,viewMonth,day);
                  const dow    = new Date(viewYear,viewMonth,day).getDay();
                  const mb     = dow===0?6:dow-1;
                  const isWknd = mb>=5;
                  const isToday = viewYear===today.getFullYear()&&viewMonth===today.getMonth()&&day===today.getDate();
                  const onVac  = employees.filter(e=>vacations[e.id]?.[dayStr]);
                  const selOnVac = selectedEmp&&vacations[selectedEmp]?.[dayStr];
                  const slots  = isWknd?[]:getWorkingSlots(mb,employees,vacations,dayStr);
                  const gaps   = isWknd?[]:getCoverageGaps(slots);
                  const hasGap = gaps.length>0;
                  const selColor = ROLE_COLORS[employees.find(e=>e.id===selectedEmp)?.role]||"#60a5fa";

                  return (
                    <div key={dayStr}
                      onClick={() => {
                        if (selectedEmp && !isWknd) toggleVacation(selectedEmp, dayStr);
                        else if (!selectedEmp && !isWknd) setDetailDay({dayStr, mb});
                      }}
                      style={{
                        borderRadius:8, padding:"5px 4px",
                        cursor: isWknd?"default":"pointer",
                        background: hasGap?"rgba(239,68,68,0.08)":selOnVac?`${selColor}18`:isWknd?"rgba(255,255,255,0.01)":"rgba(255,255,255,0.03)",
                        border: isToday?"1.5px solid rgba(96,165,250,0.45)":hasGap?"1px solid rgba(239,68,68,0.2)":selOnVac?"1px solid rgba(96,165,250,0.2)":"1px solid rgba(255,255,255,0.04)",
                        minHeight:80,
                        display:"flex", flexDirection:"column",
                        transition:"all 0.12s",
                      }}
                    >
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3, padding:"0 1px" }}>
                        <span style={{ fontSize:12, color:isWknd?"#1e3a5f":isToday?"#60a5fa":"#94a3b8", fontWeight:isToday?700:400 }}>{day}</span>
                        {hasGap && <span style={{ fontSize:8, color:"#f87171" }}>⚠</span>}
                      </div>

                      {/* Vacation dots */}
                      {onVac.length>0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:2, padding:"0 1px", marginBottom:3 }}>
                          {onVac.map(e=>(
                            <div key={e.id} title={e.name} style={{ width:14, height:14, borderRadius:"50%", background:`${ROLE_COLORS[e.role]||"#94a3b8"}33`, border:`1px solid ${ROLE_COLORS[e.role]||"#94a3b8"}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:6, color:ROLE_COLORS[e.role] }}>{e.name[0]}</div>
                          ))}
                        </div>
                      )}

                      {/* Mini coverage timeline */}
                      {!isWknd && (
                        <div style={{ marginTop:"auto" }}>
                          <CoverageTimeline dayOfWeek={mb} employees={employees} vacations={vacations} dayStr={dayStr} compact={true} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap", alignItems:"center" }}>
                {employees.map(e=>(
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
        {tab==="staff" && (
          <div style={{ maxWidth:640 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:8, letterSpacing:4, color:"#334155", textTransform:"uppercase" }}>{employees.length} empleados</div>
              <button onClick={()=>setEditingEmp({id:uid(),name:"",role:"veterinario",annualHours:1760,schedule:[...DEFAULT_SCHEDULE]})} style={{ background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.25)", borderRadius:8, color:"#4ade80", fontSize:11, fontFamily:"monospace", padding:"7px 14px", cursor:"pointer", letterSpacing:1 }}>
                + Añadir empleado
              </button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {employees.map(emp => {
                const c    = ROLE_COLORS[emp.role]||"#94a3b8";
                const used = usedHoursMap[emp.id]||0;
                const over = used>emp.annualHours;
                const weekHours = emp.schedule.reduce((a,s)=>a+shiftHours(s),0);
                return (
                  <div key={emp.id} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:38, height:38, borderRadius:"50%", background:`${c}22`, border:`1.5px solid ${c}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:c, fontWeight:700, flexShrink:0 }}>
                        {emp.name.split(" ").map(w=>w[0]).slice(0,2).join("")}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, color:"#e2e8f0" }}>{emp.name}</span>
                          <RoleBadge role={emp.role} small />
                        </div>
                        <div style={{ fontSize:9, color:"#334155" }}>
                          {weekHours.toFixed(1)}h/sem · {used.toFixed(0)}/{emp.annualHours}h año{over&&<span style={{ color:"#f87171" }}> ⚠</span>}
                        </div>
                        {/* Week schedule summary */}
                        <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                          {emp.schedule.map((s,i) => s ? (
                            <span key={i} style={{ fontSize:8, fontFamily:"monospace", color:c, background:`${c}15`, border:`1px solid ${c}25`, borderRadius:4, padding:"1px 5px" }}>
                              {DAYS_SHORT[i]} {s.start}–{s.end}
                            </span>
                          ) : (
                            <span key={i} style={{ fontSize:8, fontFamily:"monospace", color:"#1e3a5f", padding:"1px 3px" }}>{DAYS_SHORT[i]}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={()=>setEditingEmp(emp)} style={{ background:"none", border:"1px solid rgba(96,165,250,0.2)", borderRadius:6, color:"#60a5fa", fontSize:11, width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✎</button>
                        <button onClick={()=>deleteEmployee(emp.id)} style={{ background:"none", border:"1px solid rgba(248,113,113,0.2)", borderRadius:6, color:"#f87171", fontSize:11, width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editingEmp && <EmployeeModal emp={editingEmp} onSave={saveEmployee} onClose={()=>setEditingEmp(null)} />}
      {detailDay  && <DayDetail dayStr={detailDay.dayStr} dayOfWeek={detailDay.mb} employees={employees} vacations={vacations} onClose={()=>setDetailDay(null)} />}
    </div>
  );
}
