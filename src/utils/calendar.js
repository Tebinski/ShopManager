export function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function getFirstDow(y, m)    { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
export function dkey(y, m, d)        { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
export function parseDkey(k)         { const [y, m, d] = k.split("-").map(Number); return { y, m: m - 1, d }; }
export function uid()                { return Math.random().toString(36).slice(2, 9); }
