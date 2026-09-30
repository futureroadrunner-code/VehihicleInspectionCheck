import { ZONES } from "./zones";
import { format } from "./dates";
import type { Incident, ZoneResult } from "./schema";

// Plain HTML used both in the office email and in the week's .zip, so a
// report reads the same wherever it's opened.

export type ReportDay = {
  date: string;
  odometer: number;
  zones: Record<string, ZoneResult>;
  damageNotes?: string;
  incident?: Incident;
  photoCount: number;
};

export type ReportWeek = { weekOf: string; driverName: string; vehicleId: string; days: ReportDay[] };

const INCIDENT_LABEL: Record<Incident["type"], string> = {
  damage: "Damage",
  "near-miss": "Near-miss",
  mechanical: "Mechanical",
  other: "Other",
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const longDate = (iso: string) =>
  format(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function failedZones(zones: Record<string, ZoneResult>) {
  return ZONES.filter((z) => zones[z.id]?.status === "attention");
}

function zoneRows(zones: Record<string, ZoneResult>): string {
  return ZONES.map((z) => {
    const r = zones[z.id];
    const failed = r?.status === "attention";
    const status = failed
      ? `<strong style="color:#e10600">FAIL</strong>${r?.note ? ` — ${esc(r.note)}` : ""}`
      : `<span>Pass</span>`;
    return `<tr><td style="padding:6px 16px 6px 0;border-bottom:1px solid #ddd">${esc(z.label)}</td><td style="padding:6px 0;border-bottom:1px solid #ddd">${status}</td></tr>`;
  }).join("");
}

export function dayBlock(day: ReportDay, photoNote = ""): string {
  const incident = day.incident
    ? `<p><strong>Incident</strong> (${INCIDENT_LABEL[day.incident.type]}, ${esc(day.incident.time)}): ${esc(day.incident.description)}</p>`
    : "";
  const notes = day.damageNotes ? `<p><strong>Other issues:</strong> ${esc(day.damageNotes)}</p>` : "";
  return `<h3 style="margin:24px 0 8px">${esc(longDate(day.date))}</h3>
<p style="margin:0 0 8px">Odometer: <strong>${day.odometer.toLocaleString("en-US")}</strong>${photoNote}</p>
<table style="border-collapse:collapse;font-size:14px">${zoneRows(day.zones)}</table>${notes}${incident}`;
}

/** One line per day for the top of the week email. */
function overviewRows(days: ReportDay[]): string {
  return days
    .map((d) => {
      const failed = failedZones(d.zones);
      const status = failed.length
        ? `<strong style="color:#e10600">${failed.length} failed</strong>: ${failed.map((z) => esc(z.label)).join(", ")}`
        : "All pass";
      return `<tr><td style="padding:4px 16px 4px 0">${esc(format(d.date, { weekday: "short", month: "short", day: "numeric" }))}</td><td style="padding:4px 0">${status}${d.incident ? ` · <strong style="color:#e10600">incident</strong>` : ""}</td></tr>`;
    })
    .join("");
}

export function weekBodyHtml(w: ReportWeek, extra = ""): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0a0a0a">
<h2 style="margin:0 0 4px">Vehicle check — week of ${esc(format(w.weekOf, { month: "long", day: "numeric", year: "numeric" }))}</h2>
<p style="margin:0 0 16px;color:#3a3a3a">${esc(w.driverName)} · ${esc(w.vehicleId)} · ${w.days.length} day${w.days.length === 1 ? "" : "s"}${extra}</p>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:8px">${overviewRows(w.days)}</table>
${w.days.map((d) => dayBlock(d)).join("")}
<p style="margin-top:24px;color:#3a3a3a">Photos for every day are in the attached .zip file, one folder per day.</p></div>`;
}

/** Stand-alone page for one day inside the .zip, with its photos beside it. */
export function dayPageHtml(w: Omit<ReportWeek, "days">, day: ReportDay, photoFiles: string[]): string {
  const imgs = photoFiles
    .map((f) => `<figure style="margin:0"><img src="${esc(f)}" style="width:100%;border:1px solid #0a0a0a"><figcaption>${esc(f.replace(/\.jpg$/, ""))}</figcaption></figure>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>${esc(longDate(day.date))} — ${esc(w.vehicleId)}</title>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0a0a0a;max-width:52rem;margin:2rem auto;padding:0 1rem">
<p style="margin:0;color:#3a3a3a">ASCA Office Solutions · Vehicle check · ${esc(w.driverName)} · ${esc(w.vehicleId)}</p>
${dayBlock(day)}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px">${imgs}</div></body>`;
}
