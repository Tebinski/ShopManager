export const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const DAYS_SHORT = ["L","M","X","J","V","S","D"];
export const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
export const STORAGE_KEY = "clinic-v2";
export const SHARED = true;

export const CLINIC_OPEN  = 8 * 60 + 30;
export const CLINIC_CLOSE = 19 * 60;
export const CLINIC_SPAN  = CLINIC_CLOSE - CLINIC_OPEN;

export const ROLE_COLORS = { veterinario:"#4ade80", auxiliar:"#60a5fa", recepcion:"#f472b6", jefe:"#fbbf24" };
export const ROLE_LABELS = { veterinario:"Veterinario", auxiliar:"Auxiliar", recepcion:"Recepción", jefe:"Jefe" };

export const DEFAULT_DAY_SHIFT = { start:"09:00", end:"17:00" };
export const DEFAULT_SCHEDULE = [
  { start:"09:00", end:"17:00" },
  { start:"09:00", end:"17:00" },
  { start:"09:00", end:"17:00" },
  { start:"09:00", end:"17:00" },
  { start:"09:00", end:"17:00" },
  null,
  null,
];

export const SAMPLE_EMPLOYEES = [
  { id:"e1", name:"Carlos Ruiz",   role:"veterinario", annualHours:1760, schedule:[
    {start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"15:00"},{start:"08:30",end:"14:00"},null,null] },
  { id:"e2", name:"Marta López",   role:"veterinario", annualHours:1760, schedule:[
    {start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},{start:"12:00",end:"19:00"},null,null] },
  { id:"e3", name:"Sofía García",  role:"auxiliar",    annualHours:1760, schedule:[
    {start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},{start:"09:00",end:"17:00"},null,null] },
  { id:"e4", name:"Pedro Sánchez", role:"recepcion",   annualHours:1760, schedule:[
    {start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},{start:"08:30",end:"14:30"},null,null] },
];
