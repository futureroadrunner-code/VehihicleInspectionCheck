// Sends through Microsoft 365 (Microsoft Graph, app-only Mail.Send) with the
// same app registration and office mailbox as DaVision — see DaVision's
// server/taskMail.ts and docs/M365_SETUP.md. Same env variable names.

export type Attachment = { name: string; contentType: string; content: Uint8Array };
export type SendMode = "sent" | "mock";

// Reports go internally to Mario B unless MAIL_TO overrides it.
const DEFAULT_RECIPIENT = "mariob@ascaofficesolutions.com";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Microsoft 365 email settings are missing");
  }
}

type Env = Record<string, string | undefined>;

export async function sendOfficeEmail(
  mail: { subject: string; html: string; attachments?: Attachment[] },
  env: Env = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<SendMode> {
  const { M365_TENANT_ID: tenant, M365_CLIENT_ID: clientId, M365_CLIENT_SECRET: secret, MAIL_FROM: from } = env;
  if (!tenant || !clientId || !secret || !from) {
    // Pretending to send on the live site would silently lose reports, so
    // mock mode is local-only unless explicitly allowed.
    if (env.NODE_ENV === "production" && env.ALLOW_MOCK_EMAIL !== "true") throw new EmailNotConfiguredError();
    console.info(
      "[vehicle-check] M365 not configured — mock send:",
      mail.subject,
      (mail.attachments ?? []).map((a) => `${a.name} (${a.content.byteLength} B)`).join(", "),
    );
    if (env.MOCK_MAIL_DIR) await saveMock(env.MOCK_MAIL_DIR, mail);
    return "mock";
  }

  const tokenRes = await fetchFn(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Microsoft 365 mail sign-in failed (${tokenRes.status}): ${await errorCode(tokenRes)}`);
  const { access_token: token } = (await tokenRes.json()) as { access_token: string };

  const to = (env.MAIL_TO || DEFAULT_RECIPIENT)
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  const sendRes = await fetchFn(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: { contentType: "HTML", content: mail.html },
        toRecipients: to,
        attachments: (mail.attachments ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.name,
          contentType: a.contentType,
          contentBytes: Buffer.from(a.content).toString("base64"),
        })),
      },
    }),
  });
  if (!sendRes.ok) throw new Error(`Email send failed (${sendRes.status}): ${await errorCode(sendRes)}`);
  return "sent";
}

// Microsoft's error code only (e.g. ErrorAccessDenied, invalid_client) — never the raw body.
async function errorCode(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string | { code?: string } };
  return (typeof body.error === "string" ? body.error : body.error?.code) || "unknown";
}

// Local testing only: keep what would have been emailed.
async function saveMock(dir: string, mail: { subject: string; html: string; attachments?: Attachment[] }) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(dir, { recursive: true });
  const stamp = Date.now();
  await writeFile(join(dir, `${stamp}.html`), `<!-- ${mail.subject} -->\n${mail.html}`);
  for (const a of mail.attachments ?? []) await writeFile(join(dir, `${stamp}-${a.name}`), a.content);
}
