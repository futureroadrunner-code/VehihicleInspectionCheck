import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailNotConfiguredError, sendOfficeEmail } from "../lib/email.ts";

const m365 = {
  M365_TENANT_ID: "tenant",
  M365_CLIENT_ID: "client",
  M365_CLIENT_SECRET: "secret",
  MAIL_FROM: "notifications@ascaofficesolutions.com",
};
const attachment = { name: "week.zip", contentType: "application/zip", base64: "UEsDBA==" };

function fakeFetch(respond: (url: string) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url);
  }) as typeof fetch;
  return { calls, fetchFn };
}
const graphOk = (url: string) =>
  url.includes("login.microsoftonline.com") ? Response.json({ access_token: "tok" }) : new Response(null, { status: 202 });

test("Microsoft 365: signs in with the app credentials, sends from MAIL_FROM with the zip attached", async () => {
  const { calls, fetchFn } = fakeFetch(graphOk);
  assert.equal(await sendOfficeEmail({ subject: "Week", html: "<p>hi</p>", attachment }, m365, fetchFn), "sent");
  assert.match(calls[0].url, /login\.microsoftonline\.com\/tenant\/oauth2\/v2\.0\/token/);
  const form = new URLSearchParams(String(calls[0].init.body));
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("client_secret"), "secret");
  assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/users/notifications%40ascaofficesolutions.com/sendMail");
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, "Bearer tok");
  const { message } = JSON.parse(String(calls[1].init.body));
  assert.equal(message.body.contentType, "HTML");
  assert.deepEqual(message.toRecipients, [{ emailAddress: { address: "mariob@ascaofficesolutions.com" } }]);
  assert.equal(message.attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
  assert.equal(message.attachments[0].name, "week.zip");
  assert.equal(message.attachments[0].contentBytes, "UEsDBA==");
});

test("MAIL_TO overrides the recipient and accepts a list", async () => {
  const { calls, fetchFn } = fakeFetch(graphOk);
  await sendOfficeEmail({ subject: "s", html: "h" }, { ...m365, MAIL_TO: "a@x.com, b@x.com" }, fetchFn);
  const { message } = JSON.parse(String(calls[1].init.body));
  assert.deepEqual(message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address), ["a@x.com", "b@x.com"]);
});

test("reports Microsoft's error code, never the raw body", async () => {
  const { fetchFn } = fakeFetch((url) =>
    url.includes("login") ? Response.json({ access_token: "tok" }) : Response.json({ error: { code: "ErrorAccessDenied" } }, { status: 403 }),
  );
  await assert.rejects(sendOfficeEmail({ subject: "s", html: "h" }, m365, fetchFn), /Email send failed \(403\): ErrorAccessDenied/);
});

test("SMTP2GO_API_KEY switches to SMTP2GO's web API", async () => {
  const { calls, fetchFn } = fakeFetch(() => Response.json({ data: { succeeded: 1 } }));
  const env = { SMTP2GO_API_KEY: "api-123", MAIL_FROM: "Vehicle Check <service@ascaofficesolutions.com>" };
  assert.equal(await sendOfficeEmail({ subject: "Week", html: "<p>hi</p>", attachment }, env, fetchFn), "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.smtp2go.com/v3/email/send");
  assert.equal((calls[0].init.headers as Record<string, string>)["X-Smtp2go-Api-Key"], "api-123");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.sender, env.MAIL_FROM);
  assert.deepEqual(body.to, ["mariob@ascaofficesolutions.com"]);
  assert.deepEqual(body.attachments, [{ filename: "week.zip", fileblob: "UEsDBA==", mimetype: "application/zip" }]);
});

test("SMTP2GO failure surfaces its error code", async () => {
  const { fetchFn } = fakeFetch(() => Response.json({ data: { succeeded: 0, error_code: "E_ApiResponseCodes.SENDER_NOT_VERIFIED" } }, { status: 400 }));
  await assert.rejects(
    sendOfficeEmail({ subject: "s", html: "h" }, { SMTP2GO_API_KEY: "k" }, fetchFn),
    /SENDER_NOT_VERIFIED/,
  );
});

test("unconfigured is an error on the live site, not a silent mock", async () => {
  await assert.rejects(sendOfficeEmail({ subject: "s", html: "h" }, {}), EmailNotConfiguredError);
});

test("unconfigured with ALLOW_MOCK_EMAIL mock-sends (local testing)", async () => {
  assert.equal(await sendOfficeEmail({ subject: "s", html: "h" }, { ALLOW_MOCK_EMAIL: "true" }), "mock");
});
