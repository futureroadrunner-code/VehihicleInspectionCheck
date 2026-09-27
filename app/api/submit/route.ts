import { NextResponse } from "next/server";
import { dailySchema, weekSchema } from "@/lib/schema";
import { EmailNotConfiguredError, dailyEmail, sendMail, weekEmail, type Attachment } from "@/lib/email";

export const runtime = "nodejs";

const MAX_PHOTOS = 8;
// Client compresses to 500 KB; allow a little slack for multipart overhead.
const MAX_PHOTO_BYTES = 600_000;

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

  try {
    if ((payload as { mode?: unknown })?.mode === "week") {
      const parsed = weekSchema.safeParse(payload);
      if (!parsed.success) return fail("Week report is incomplete.");
      const { subject, html } = weekEmail(parsed.data);
      const mode = await sendMail(subject, html);
      return NextResponse.json({ success: true, data: { mode } });
    }

    const parsed = dailySchema.safeParse(payload);
    if (!parsed.success) return fail("Checklist is incomplete. Check driver, vehicle, date, and odometer.");

    const photos = form.getAll("photos").filter((p): p is File => p instanceof File);
    if (photos.length > MAX_PHOTOS) return fail(`At most ${MAX_PHOTOS} photos.`);
    const attachments: Attachment[] = [];
    for (const p of photos) {
      if (!p.type.startsWith("image/")) return fail("Photos must be images.");
      if (p.size > MAX_PHOTO_BYTES) return fail("A photo is too large. Retake it and try again.");
      attachments.push({
        filename: p.name || "photo.jpg",
        content: Buffer.from(await p.arrayBuffer()),
        contentType: p.type,
      });
    }

    const { subject, html } = dailyEmail(parsed.data, attachments.length);
    const mode = await sendMail(subject, html, attachments);
    return NextResponse.json({ success: true, data: { mode } });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      console.error("[fleetcheck] SMTP_HOST missing in production");
      return fail("Email isn’t set up on the server yet, so this report was NOT sent. Tell the office.", 503);
    }
    console.error("[fleetcheck] send failed", err);
    return fail("Email could not be sent. Try again in a minute.", 502);
  }
}
