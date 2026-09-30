// Cloudflare Worker: static app from out/ (ASSETS) + POST /api/submit.
import { weekSchema } from "../lib/schema";
import { EmailNotConfiguredError, sendOfficeEmail, type MailEnv } from "../lib/email";
import { failedZones, weekBodyHtml } from "../lib/report-html";
import { format } from "../lib/dates";

type Env = MailEnv & { ASSETS: { fetch(req: Request): Promise<Response> } };

// Microsoft 365 caps a sendMail request at ~4 MB. The phone keeps each .zip
// under 2.7 MB, which is ~3.6 MB once base64-encoded.
const MAX_BASE64_CHARS = 3_900_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => json({ success: false, error }, status);

async function submit(req: Request, env: Env): Promise<Response> {
  // Body: one line of JSON (the week), a newline, then the .zip as base64.
  const text = await req.text();
  const cut = text.indexOf("\n");
  if (cut < 0) return fail("Could not read the submission.");
  let head: unknown;
  try {
    head = JSON.parse(text.slice(0, cut));
  } catch {
    return fail("Could not read the submission.");
  }
  const parsed = weekSchema.safeParse(head);
  if (!parsed.success) return fail("Week report is incomplete.");
  const week = parsed.data;

  const base64 = text.slice(cut + 1);
  if (!base64) return fail("The week’s .zip file is missing.");
  if (base64.length > MAX_BASE64_CHARS) return fail("The week’s photos are too large to email. Retake the largest photos.");
  // Spliced into JSON as-is, so it must be plain base64 (no quotes, backslashes or newlines).
  if (base64.includes('"') || base64.includes("\\") || base64.includes("\n")) return fail("The week’s .zip file is damaged.");

  const failedDays = week.days.filter((d) => failedZones(d.zones).length > 0 || d.incident).length;
  const partNote = week.parts > 1 ? ` · part ${week.part} of ${week.parts}` : "";
  const subject =
    `Vehicle check · ${week.vehicleId} · week of ${format(week.weekOf, { month: "short", day: "numeric" })} · ${week.driverName}` +
    ` · ${week.days.length} day${week.days.length === 1 ? "" : "s"}` +
    (failedDays ? ` · ${failedDays} with issues` : " · all pass") +
    partNote;
  const fileName = /^[\w.-]{1,120}\.zip$/.test(week.fileName) ? week.fileName : "vehicle-check.zip";

  try {
    const mode = await sendOfficeEmail(
      { subject, html: weekBodyHtml(week, partNote), attachment: { name: fileName, contentType: "application/zip", base64 } },
      env,
    );
    return json({ success: true, data: { mode } });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      console.error("[vehicle-check] email settings missing");
      return fail("Email isn’t set up on the server yet, so this week was NOT sent. It’s still saved on the phone. Tell the office.", 503);
    }
    console.error("[vehicle-check] send failed", err instanceof Error ? err.message : err);
    return fail("The office email could not be sent. The week is still saved on the phone — try again later.", 502);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/submit") {
      if (req.method !== "POST") return fail("Method not allowed.", 405);
      return submit(req, env);
    }
    return env.ASSETS.fetch(req);
  },
};
