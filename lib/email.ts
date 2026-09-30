// Office email for the Cloudflare Worker.
//
// Default: Microsoft 365 (Microsoft Graph, app-only Mail.Send) with the same
// app registration, mailbox and variable names as DaVision — see DaVision's
// server/taskMail.ts and docs/M365_SETUP.md.
// Alternative: set SMTP2GO_API_KEY to send through SMTP2GO's web API instead.
//
// The attachment arrives already base64-encoded from the phone and is spliced
// into the request text as-is: re-encoding a ~3 MB string would blow the
// Worker's CPU budget on Cloudflare's free plan.

export type Attachment = { name: string; contentType: string; base64: string };
export type SendMode = "sent" | "mock";
export type MailEnv = Record<string, string | undefined>;

// Reports go internally to Mario B unless MAIL_TO overrides it.
const DEFAULT_RECIPIENT = "mariob@ascaofficesolutions.com";
const DEFAULT_SMTP2GO_SENDER = "ASCA Vehicle Check <service@ascaofficesolutions.com>";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email settings are missing");
  }
}

type Mail = { subject: string; html: string; attachment?: Attachment };

const recipients = (env: MailEnv) =>
  (env.MAIL_TO || DEFAULT_RECIPIENT)
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

/** JSON text with one base64 string dropped in without re-serializing it. */
function withAttachment(json: string, placeholder: string, base64: string): string {
  const i = json.indexOf(placeholder);
  return json.slice(0, i) + base64 + json.slice(i + placeholder.length);
}

export async function sendOfficeEmail(mail: Mail, env: MailEnv, fetchFn: typeof fetch = fetch): Promise<SendMode> {
  if (env.SMTP2GO_API_KEY) return sendViaSmtp2go(mail, env, fetchFn);

  const { M365_TENANT_ID: tenant, M365_CLIENT_ID: clientId, M365_CLIENT_SECRET: secret, MAIL_FROM: from } = env;
  if (!tenant || !clientId || !secret || !from) {
    // Pretending to send on the live site would silently lose reports, so
    // mock mode only runs when explicitly allowed (local testing).
    if (env.ALLOW_MOCK_EMAIL !== "true") throw new EmailNotConfiguredError();
    console.log(
      `[vehicle-check] mock send: ${mail.subject}` +
        (mail.attachment ? ` | ${mail.attachment.name} (${Math.round((mail.attachment.base64.length * 3) / 4)} B)` : ""),
    );
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

  const PLACEHOLDER = "@@ATTACHMENT@@";
  const json = JSON.stringify({
    message: {
      subject: mail.subject,
      body: { contentType: "HTML", content: mail.html },
      toRecipients: recipients(env).map((address) => ({ emailAddress: { address } })),
      attachments: mail.attachment
        ? [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: mail.attachment.name,
              contentType: mail.attachment.contentType,
              contentBytes: PLACEHOLDER,
            },
          ]
        : [],
    },
  });
  const sendRes = await fetchFn(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: mail.attachment ? withAttachment(json, PLACEHOLDER, mail.attachment.base64) : json,
  });
  if (!sendRes.ok) throw new Error(`Email send failed (${sendRes.status}): ${await errorCode(sendRes)}`);
  return "sent";
}

async function sendViaSmtp2go(mail: Mail, env: MailEnv, fetchFn: typeof fetch): Promise<SendMode> {
  const PLACEHOLDER = "@@ATTACHMENT@@";
  const json = JSON.stringify({
    sender: env.MAIL_FROM || DEFAULT_SMTP2GO_SENDER,
    to: recipients(env),
    subject: mail.subject,
    html_body: mail.html,
    attachments: mail.attachment
      ? [{ filename: mail.attachment.name, fileblob: PLACEHOLDER, mimetype: mail.attachment.contentType }]
      : [],
  });
  const res = await fetchFn("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Smtp2go-Api-Key": env.SMTP2GO_API_KEY! },
    body: mail.attachment ? withAttachment(json, PLACEHOLDER, mail.attachment.base64) : json,
  });
  const out = (await res.json().catch(() => ({}))) as { data?: { succeeded?: number; error_code?: string } };
  if (!res.ok || !out.data?.succeeded) {
    throw new Error(`Email send failed (${res.status}): ${out.data?.error_code || "unknown"}`);
  }
  return "sent";
}

// Provider error code only (e.g. ErrorAccessDenied, invalid_client) — never the raw body.
async function errorCode(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string | { code?: string } };
  return (typeof body.error === "string" ? body.error : body.error?.code) || "unknown";
}
