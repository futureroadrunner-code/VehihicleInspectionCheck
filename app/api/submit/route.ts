import { NextResponse } from "next/server";
import { weekSchema } from "@/lib/schema";
import { EmailNotConfiguredError, sendOfficeEmail } from "@/lib/email";
import { failedZones, weekBodyHtml } from "@/lib/report-html";
import { format } from "@/lib/dates";

export const runtime = "nodejs";

// Microsoft 365 caps a sendMail request at ~4 MB; the phone keeps each .zip under 2.7 MB.
const MAX_ARCHIVE_BYTES = 2_900_000;

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Could not read the submission.");
  }

  const raw = form.get("payload");
  if (typeof raw !== "string") return fail("Missing payload.");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail("Payload is not valid JSON.");
  }
  const parsed = weekSchema.safeParse(payload);
  if (!parsed.success) return fail("Week report is incomplete.");
  const week = parsed.data;

  const archive = form.get("archive");
  if (!(archive instanceof File)) return fail("The week’s .zip file is missing.");
  if (archive.size > MAX_ARCHIVE_BYTES) return fail("The week’s photos are too large to email. Retake the largest photos.");

  const failedDays = week.days.filter((d) => failedZones(d.zones).length > 0 || d.incident).length;
  const partNote = week.parts > 1 ? ` · part ${week.part} of ${week.parts}` : "";
  const subject =
    `Vehicle check · ${week.vehicleId} · week of ${format(week.weekOf, { month: "short", day: "numeric" })} · ${week.driverName}` +
    ` · ${week.days.length} day${week.days.length === 1 ? "" : "s"}` +
    (failedDays ? ` · ${failedDays} with issues` : " · all pass") +
    partNote;

  try {
    const mode = await sendOfficeEmail({
      subject,
      html: weekBodyHtml(week, partNote),
      attachments: [
        { name: archive.name || "vehicle-check.zip", contentType: "application/zip", content: new Uint8Array(await archive.arrayBuffer()) },
      ],
    });
    return NextResponse.json({ success: true, data: { mode } });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      console.error("[vehicle-check] M365 email settings missing in production");
      return fail("Email isn’t set up on the server yet, so this week was NOT sent. It’s still saved on the phone. Tell the office.", 503);
    }
    console.error("[vehicle-check] send failed", err);
    return fail("The office email could not be sent. The week is still saved on the phone — try again later.", 502);
  }
}
