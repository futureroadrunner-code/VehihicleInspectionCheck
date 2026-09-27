import nodemailer from "nodemailer";
import { ZONES } from "./zones";
import { format } from "./dates";
import type { DailyReport, SavedDay, WeekReport, ZoneResult } from "./schema";

export type Attachment = { filename: string; content: Buffer; contentType: string };
export type SendMode = "smtp" | "mock";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const longDate = (iso: string) =>
  format(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const INCIDENT_LABEL = { damage: "Damage", "near-miss": "Near-miss", mechanical: "Mechanical", other: "Other" };

function flagged(zones: Record<string, ZoneResult>) {
  return ZONES.filter((z) => zones[z.id]?.status === "attention");
}

function zoneRows(zones: Record<string, ZoneResult>): string {
  return ZONES.map((z) => {
    const r = zones[z.id];
    const bad = r?.status === "attention";
    const status = bad
      ? `<strong style="color:#b4531b">ATTENTION</strong>${r?.note ? ` — ${esc(r.note)}` : ""}`
      : `<span style="color:#1d6b3a">Pass</span>`;
    return `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #e5e7eb">${esc(z.label)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${status}</td></tr>`;
  }).join("");
}

function dayBlock(day: Pick<SavedDay, "date" | "odometer" | "zones" | "damageNotes" | "incident">): string {
  const incident = day.incident
    ? `<p><strong>Incident</strong> (${INCIDENT_LABEL[day.incident.type]}, ${esc(day.incident.time)}): ${esc(day.incident.description)}</p>`
    : "";
  const notes = day.damageNotes ? `<p><strong>Notes:</strong> ${esc(day.damageNotes)}</p>` : "";
  return `<h3 style="margin:24px 0 8px">${esc(longDate(day.date))}</h3>
<p style="margin:0 0 8px">Odometer: <strong>${day.odometer.toLocaleString("en-US")}</strong></p>
<table style="border-collapse:collapse;font-size:14px">${zoneRows(day.zones)}</table>${notes}${incident}`;
}

export function dailyEmail(r: DailyReport, photoCount: number) {
  const bad = flagged(r.zones);
  const subject = `FleetCheck · ${r.vehicleId} · ${r.date} · ${r.driverName}${bad.length ? ` · ${bad.length} need attention` : " · all pass"}${r.incident ? " · INCIDENT" : ""}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
<h2 style="margin:0 0 4px">Daily vehicle check</h2>
<p style="margin:0 0 16px;color:#555">${esc(r.driverName)} · ${esc(r.vehicleId)} · week of ${esc(r.weekOf)}</p>
${dayBlock(r)}
<p style="color:#555">${photoCount} proof photo${photoCount === 1 ? "" : "s"} attached.</p></div>`;
  return { subject, html };
}

export function weekEmail(r: WeekReport) {
  const flaggedDays = r.days.filter((d) => flagged(d.zones).length > 0 || d.incident).length;
  const subject = `FleetCheck week rollup · ${r.vehicleId} · week of ${r.weekOf} · ${r.driverName} · ${r.days.length} day${r.days.length === 1 ? "" : "s"}${flaggedDays ? ` · ${flaggedDays} flagged` : ""}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
<h2 style="margin:0 0 4px">Week rollup</h2>
<p style="margin:0 0 16px;color:#555">${esc(r.driverName)} · ${esc(r.vehicleId)} · week of ${esc(r.weekOf)} · ${r.days.length} day(s) on file</p>
${r.days.map(dayBlock).join("")}</div>`;
  return { subject, html };
}

const DEFAULT_SENDER = "service@ascaofficesolutions.com";
// Reports go internally to Mario B unless MAIL_TO overrides it.
const DEFAULT_RECIPIENT = "mariob@ascaofficesolutions.com";

// SMTP2GO logins are plain usernames, not addresses, so only fall back to
// SMTP_USER when it is an email. The sender must be verified in SMTP2GO.
function mailFrom(): string {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  const user = process.env.SMTP_USER ?? "";
  return user.includes("@") ? user : `ASCA Vehicle Check <${DEFAULT_SENDER}>`;
}

export async function sendMail(
  subject: string,
  html: string,
  attachments: Attachment[] = [],
): Promise<SendMode> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info("[fleetcheck] SMTP_HOST not set — mock send:", subject);
    return "mock";
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: mailFrom(),
    to: process.env.MAIL_TO || DEFAULT_RECIPIENT,
    subject,
    html,
    attachments,
  });
  return "smtp";
}
