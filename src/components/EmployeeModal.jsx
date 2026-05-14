import { useState } from "react";
import { DAYS_FULL, DAYS_SHORT, ROLE_COLORS, ROLE_LABELS, DEFAULT_SCHEDULE, DEFAULT_DAY_SHIFT } from "../constants/index.js";
import { uid } from "../utils/calendar.js";
import { shiftHours } from "../utils/time.js";
import { labelSt, inputSt, saveBtnSt, cancelBtnSt } from "../styles/shared.js";
import Modal from "./Modal.jsx";
import TimeInput from "./TimeInput.jsx";

export default function EmployeeModal({ emp, onSave, onClose }) {
  const isNew = !emp || !emp.name;
  const [form, setForm] = useState(isNew
    ? { id:uid(), name:"", role:"veterinario", annualHours:1760, schedule:[...DEFAULT_SCHEDULE] }
    : { ...emp, schedule: emp.schedule.map(s => s ? { ...s } : null) }
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]:v }));

  function setShift(dow, field, val) {
    setForm(f => {
      const sched = f.schedule.map((s, i) =>
        i === dow ? (s ? { ...s, [field]:val } : { ...DEFAULT_DAY_SHIFT, [field]:val }) : s
      );
      return { ...f, schedule:sched };
    });
  }

  function toggleDay(dow) {
    setForm(f => {
      const sched = [...f.schedule];
      sched[dow] = sched[dow] ? null : { ...DEFAULT_DAY_SHIFT };
      return { ...f, schedule:sched };
    });
  }

  const totalHours = form.schedule.reduce((acc, s) => acc + shiftHours(s), 0);

  return (
    <Modal title={isNew ? "Nuevo empleado" : "Editar empleado"} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <label style={labelSt}>
          Nombre
          <input value={form.name} onChange={e => set("name", e.target.value)} style={inputSt} placeholder="Nombre completo" />
        </label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 56px", gap:12 }}>
          <label style={labelSt}>
            Rol
            <select value={form.role} onChange={e => set("role", e.target.value)} style={inputSt}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={labelSt}>
            Horas anuales
            <input type="number" value={form.annualHours} onChange={e => set("annualHours", Number(e.target.value))} style={inputSt} />
          </label>
          <label style={labelSt}>
            Color
            <input type="color" value={form.color || ROLE_COLORS[form.role] || "#94a3b8"} onChange={e => set("color", e.target.value)} style={{ width:"100%", height:34, padding:2, border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, background:"rgba(255,255,255,0.04)", cursor:"pointer" }} />
          </label>
        </div>

        <div style={labelSt}>
          Horario semanal
          <div style={{ fontSize:9, color:"#94a3b8", marginBottom:6 }}>Semana típica · {totalHours.toFixed(1)}h/semana</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {DAYS_FULL.map((day, i) => {
              const shift  = form.schedule[i];
              const isWknd = i >= 5;
              const color  = ROLE_COLORS[form.role] || "#94a3b8";
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, opacity:isWknd && !shift ? 0.3 : 1 }}>
                  <button onClick={() => toggleDay(i)} style={{ width:52, padding:"3px 0", fontSize:9, fontFamily:"monospace", background:shift ? `${color}22` : "rgba(255,255,255,0.04)", border:`1px solid ${shift ? color+"44" : "rgba(255,255,255,0.08)"}`, borderRadius:5, color:shift ? color : "#475569", cursor:"pointer", letterSpacing:1 }}>
                    {DAYS_SHORT[i]}{shift ? "" : " —"}
                  </button>
                  {shift ? (
                    <>
                      <TimeInput value={shift.start} onChange={v => setShift(i, "start", v)} color={color} />
                      <span style={{ fontSize:10, color:"#94a3b8" }}>→</span>
                      <TimeInput value={shift.end} onChange={v => setShift(i, "end", v)} color={color} />
                      <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{shiftHours(shift).toFixed(1)}h</span>
                    </>
                  ) : (
                    <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>No trabaja</span>
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
