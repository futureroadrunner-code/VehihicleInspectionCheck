"use client";

import { addDays, isWeekday, workweek } from "./dates";
import { allDays, daysInWeek, getWeek, putDay, putWeek, type StoredDay } from "./local-db";

export type SendResult = { weekOf: string; daysSent: number; mode: "smtp" | "mock" | null };

/** Friday of the week that starts on `weekOf`. */
export const fridayOf = (weekOf: string) => addDays(weekOf, 4);

/**
 * A week goes to the office once it's finished: all five weekdays are saved,
 * Friday is saved, or Friday has passed.
 */
export function weekIsDue(weekOf: string, days: StoredDay[], today: string): boolean {
  if (days.length === 0) return false;
  const friday = fridayOf(weekOf);
  if (today > friday) return true;
  const saved = new Set(days.map((d) => d.date));
  if (saved.has(friday)) return true;
  return workweek(weekOf).every((d) => saved.has(d));
}

async function post(body: FormData): Promise<"smtp" | "mock"> {
  let res: Response;
  try {
    res = await fetch("/api/submit", { method: "POST", body });
  } catch {
    throw new Error("No connection. The week is saved on this phone and will send when you’re back online.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || "The office email could not be sent. Try again.");
  return json.data?.mode ?? "smtp";
}

const inFlight = new Map<string, Promise<SendResult>>();

/** Send every unsent day of the week (with photos), then the week summary. */
export function sendWeek(weekOf: string): Promise<SendResult> {
  const running = inFlight.get(weekOf);
  if (running) return running;
  const p = doSendWeek(weekOf).finally(() => inFlight.delete(weekOf));
  inFlight.set(weekOf, p);
  return p;
}

async function doSendWeek(weekOf: string): Promise<SendResult> {
  const days = await daysInWeek(weekOf);
  let daysSent = 0;
  let mode: SendResult["mode"] = null;

  for (const day of days) {
    if (day.sentAt) continue;
    const body = new FormData();
    body.set(
      "payload",
      JSON.stringify({
        driverName: day.driverName,
        vehicleId: day.vehicleId,
        weekOf: day.weekOf,
        date: day.date,
        odometer: day.odometer,
        zones: day.zones,
        damageNotes: day.damageNotes,
        incident: day.incident,
      }),
    );
    for (const p of day.photos) body.append("photos", new File([p.blob], `${day.date}-${p.view}.jpg`, { type: "image/jpeg" }));
    mode = await post(body);
    // Mark sent right away so a later failure never re-sends this day.
    // Photos are already in the office inbox, so free the space on the phone.
    await putDay({ ...day, sentAt: new Date().toISOString(), photos: [] });
    daysSent++;
  }

  const week = await getWeek(weekOf);
  if (days.length > 0 && !week?.summarySentAt) {
    const latest = days[days.length - 1];
    const body = new FormData();
    body.set(
      "payload",
      JSON.stringify({
        mode: "week",
        weekOf,
        driverName: latest.driverName,
        vehicleId: latest.vehicleId,
        days: days.map((d) => ({
          date: d.date,
          odometer: d.odometer,
          zones: d.zones,
          damageNotes: d.damageNotes,
          incident: d.incident,
          photoCount: d.photoCount,
          emailed: true,
        })),
      }),
    );
    mode = await post(body);
    await putWeek({ weekOf, summarySentAt: new Date().toISOString() });
  }

  return { weekOf, daysSent, mode };
}

/** Weeks that are finished but still have something to send. */
export async function dueWeeks(today: string): Promise<string[]> {
  const byWeek = new Map<string, StoredDay[]>();
  for (const d of await allDays()) {
    if (!isWeekday(d.date)) continue;
    byWeek.set(d.weekOf, [...(byWeek.get(d.weekOf) ?? []), d]);
  }
  const due: string[] = [];
  for (const [weekOf, days] of byWeek) {
    if (!weekIsDue(weekOf, days, today)) continue;
    const week = await getWeek(weekOf);
    if (days.some((d) => !d.sentAt) || !week?.summarySentAt) due.push(weekOf);
  }
  return due.sort();
}
