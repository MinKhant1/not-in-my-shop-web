import { fixtureById, sectionById } from '../world/StoreSections.js';

// C(d, s) = round(10 + 4*log2(1+s) + min(8, 0.45*(d-1)))
// d starts at 1. s is purchased fixtures from Section 2 onward. 10 is Section 1.
export function customersPerDay(day, shelves) {
  const d = Math.max(1, Math.round(Number(day)) || 1);
  const s = Math.max(0, Math.floor(Number(shelves)) || 0);
  const fromShelves = 4 * Math.log2(1 + s);
  const fromDay = Math.min(8, 0.45 * (d - 1));
  return Math.round(10 + fromShelves + fromDay);
}

export function countExpansionShelves(owned) {
  if (!owned) {
    return 0;
  }
  let count = 0;
  for (const id of owned) {
    const fixture = fixtureById.get(id);
    const section = fixture ? sectionById(fixture.sectionId) : null;
    if (section && section.index >= 1) {
      count += 1;
    }
  }
  return count;
}
