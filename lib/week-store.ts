import type { SavedDay } from "./schema";

// Key format is unchanged from the first release so week backups already on
// techs' phones keep rolling up.
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  const s = storage();
  return s ? s.getItem(key) : (memory.get(key) ?? null);
}

function write(key: string, value: string) {
  const s = storage();
  if (s) s.setItem(key, value);
  else memory.set(key, value);
}

const dayKey = (weekOf: string, driver: string, vehicle: string, date: string) =>
  `fleetcheck:week:${weekOf}:${driver}:${vehicle}:${date}`;
const indexKey = (weekOf: string, driver: string, vehicle: string) =>
  `fleetcheck:week-index:${weekOf}:${driver}:${vehicle}`;

function readIndex(weekOf: string, driver: string, vehicle: string): string[] {
  const raw = read(indexKey(weekOf, driver, vehicle));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

type WeekId = { weekOf: string; driverName: string; vehicleId: string };

export function saveDay(id: WeekId, day: SavedDay) {
  const { weekOf, driverName, vehicleId } = id;
  write(dayKey(weekOf, driverName, vehicleId, day.date), JSON.stringify(day));
  const dates = readIndex(weekOf, driverName, vehicleId);
  if (!dates.includes(day.date)) {
    const next = [...new Set([...dates, day.date])].sort();
    write(indexKey(weekOf, driverName, vehicleId), JSON.stringify(next));
  }
}

export function loadEmailedDays(id: WeekId): SavedDay[] {
  const { weekOf, driverName, vehicleId } = id;
  const days: SavedDay[] = [];
  for (const date of readIndex(weekOf, driverName, vehicleId)) {
    const raw = read(dayKey(weekOf, driverName, vehicleId, date));
    if (!raw) continue;
    try {
      const day = JSON.parse(raw) as SavedDay;
      if (day.emailed) days.push(day);
    } catch {
      // skip corrupt entries
    }
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** Dates in the given week that were already emailed from this phone. */
export function sentDates(id: WeekId): Set<string> {
  return new Set(loadEmailedDays(id).map((d) => d.date));
}
