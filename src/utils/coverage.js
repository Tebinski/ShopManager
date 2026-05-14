import { CLINIC_OPEN, CLINIC_CLOSE } from "../constants/index.js";
import { toMin } from "./time.js";

export function getWorkingSlots(dayOfWeek, employees, vacations, dayStr) {
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

export function getCoverageGaps(slots) {
  const vets = slots.filter(s => s.role === "veterinario");
  const gaps = [];
  for (let t = CLINIC_OPEN; t < CLINIC_CLOSE; t++) {
    const covered = vets.some(v => v.startMin <= t && v.endMin > t);
    if (!covered) gaps.push(t);
  }
  if (gaps.length === 0) return [];
  const ranges = [];
  let start = gaps[0];
  for (let i = 1; i <= gaps.length; i++) {
    if (i === gaps.length || gaps[i] !== gaps[i - 1] + 1) {
      ranges.push({ startMin: start, endMin: gaps[i - 1] + 1 });
      start = gaps[i];
    }
  }
  return ranges;
}
