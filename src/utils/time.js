export function toMin(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMin(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function shiftHours(shift) {
  if (!shift || !shift.start || !shift.end) return 0;
  return Math.max(0, (toMin(shift.end) - toMin(shift.start)) / 60);
}
