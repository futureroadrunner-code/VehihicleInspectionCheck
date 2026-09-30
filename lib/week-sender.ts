"use client";

import { addDays, isWeekday, workweek } from "./dates";
import { allDays, daysInWeek, putDay, type StoredDay } from "./local-db";
import { buildWeekParts, toReportDay } from "./week-package";

export type SendResult = { weekOf: string; daysSent: number; emails: number; mode: "sent" | "mock" | null };

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

async function post(body: FormData): Promise<"sent" | "mock"> {
  let res: Response;
  try {
    res = await fetch("/api/submit", { method: "POST", body });
  } catch {
    throw new Error("No connection. The week is saved on this phone and will send when you’re back online.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || "The office email could not be sent. Try again.");
  return json.data?.mode ?? "sent";
}

const inFlight = new Map<string, Promise<SendResult>>();

/** Zip every unsent day of the week (reports + photos) and email it to the office. */
export function sendWeek(weekOf: string): Promise<SendResult> {
  const running = inFlight.get(weekOf);
  if (running) return running;
  const p = doSendWeek(weekOf).finally(() => inFlight.delete(weekOf));
  inFlight.set(weekOf, p);
  return p;
}

async function doSendWeek(weekOf: string): Promise<SendResult> {
  const unsent = (await daysInWeek(weekOf)).filter((d) => !d.sentAt);
  const result: SendResult = { weekOf, daysSent: 0, emails: 0, mode: null };
  if (unsent.length === 0) return result;

  const latest = unsent[unsent.length - 1];
  const meta = { weekOf, driverName: latest.driverName, vehicleId: latest.vehicleId };
  const parts = await buildWeekParts(meta, unsent);

  for (const [i, part] of parts.entries()) {
    const body = new FormData();
    body.set(
      "payload",
      JSON.stringify({ mode: "week", ...meta, part: i + 1, parts: parts.length, days: part.days.map(toReportDay) }),
    );
    body.set("archive", new File([part.zip as Uint8Array<ArrayBuffer>], part.fileName, { type: "application/zip" }));
    result.mode = await post(body);
    result.emails++;
    // Mark sent right away so a later failure never re-sends these days.
    // Their photos are now in the office inbox, so free the space on the phone.
    const sentAt = new Date().toISOString();
    for (const d of part.days) await putDay({ ...d, sentAt, photos: [] });
    result.daysSent += part.days.length;
  }
  return result;
}

/** Weeks that are finished but still have unsent days. */
export async function dueWeeks(today: string): Promise<string[]> {
  const byWeek = new Map<string, StoredDay[]>();
  for (const d of await allDays()) {
    if (!isWeekday(d.date)) continue;
    byWeek.set(d.weekOf, [...(byWeek.get(d.weekOf) ?? []), d]);
  }
  return [...byWeek]
    .filter(([weekOf, days]) => weekIsDue(weekOf, days, today) && days.some((d) => !d.sentAt))
    .map(([weekOf]) => weekOf)
    .sort();
}
