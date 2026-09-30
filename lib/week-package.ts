"use client";

import { strToU8, zipSync, type Zippable } from "fflate";
import { format } from "./dates";
import { dayPageHtml, weekBodyHtml, type ReportDay } from "./report-html";
import type { StoredDay } from "./local-db";

// Microsoft 365 rejects a sendMail request over ~4 MB, and attachments are
// base64-encoded (+33%), so each .zip stays under this.
export const MAX_ZIP_BYTES = 2_700_000;

export type WeekMeta = { weekOf: string; driverName: string; vehicleId: string };
export type WeekPart = { days: StoredDay[]; zip: Uint8Array; fileName: string };

export const toReportDay = (d: StoredDay): ReportDay => ({
  date: d.date,
  odometer: d.odometer,
  zones: d.zones,
  damageNotes: d.damageNotes,
  incident: d.incident,
  photoCount: d.photoCount,
});

const dayFolder = (d: StoredDay) => `${d.date}-${format(d.date, { weekday: "long" }).toLowerCase()}`;
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "vehicle";

/** Split days into groups whose photos fit one email, keeping days in order. */
function groupDays(days: StoredDay[]): StoredDay[][] {
  const groups: StoredDay[][] = [];
  let current: StoredDay[] = [];
  let bytes = 0;
  for (const d of days) {
    const size = d.photos.reduce((n, p) => n + p.sizeBytes, 0) + 30_000;
    if (current.length && bytes + size > MAX_ZIP_BYTES) {
      groups.push(current);
      current = [];
      bytes = 0;
    }
    current.push(d);
    bytes += size;
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Build the week's .zip file(s): a summary page plus one folder per day with its report and photos. */
export async function buildWeekParts(meta: WeekMeta, days: StoredDay[]): Promise<WeekPart[]> {
  const groups = groupDays(days);
  const base = `vehicle-check_${meta.weekOf}_${safe(meta.vehicleId)}`;
  const parts: WeekPart[] = [];
  for (const [i, group] of groups.entries()) {
    const files: Zippable = {};
    const summary = weekBodyHtml({ ...meta, days: group.map(toReportDay) });
    files["week-summary.html"] = [strToU8(`<!doctype html><meta charset="utf-8"><body style="max-width:52rem;margin:2rem auto;padding:0 1rem">${summary}</body>`), { level: 6 }];
    for (const d of group) {
      const folder = dayFolder(d);
      const photoNames: string[] = [];
      for (const p of d.photos) {
        const name = `${p.view}.jpg`;
        photoNames.push(name);
        // JPEGs are already compressed; storing them as-is keeps zipping fast on the phone.
        files[`${folder}/${name}`] = [new Uint8Array(await p.blob.arrayBuffer()), { level: 0 }];
      }
      files[`${folder}/report.html`] = [strToU8(dayPageHtml(meta, toReportDay(d), photoNames)), { level: 6 }];
    }
    const suffix = groups.length > 1 ? `_part-${i + 1}-of-${groups.length}` : "";
    parts.push({ days: group, zip: zipSync(files), fileName: `${base}${suffix}.zip` });
  }
  return parts;
}
