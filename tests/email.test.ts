import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailNotConfiguredError, sendOfficeEmail } from "../lib/email.ts";

const env = {
  M365_TENANT_ID: "tenant",
  M365_CLIENT_ID: "client",
  M365_CLIENT_SECRET: "secret",
  MAIL_FROM: "notifications@ascaofficesolutions.com",
};
const zip = { name: "week.zip", contentType: "application/zip", content: new Uint8Array([80, 75, 3, 4]) };

function fakeGraph(sendStatus = 202) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("login.microsoftonline.com")) return Response.json({ access_token: "tok" });
    return sendStatus < 300 ? new Response(null, { status: sendStatus }) : Response.json({ error: { code: "ErrorAccessDenied" } }, { status: sendStatus });
  }) as typeof fetch;
  return { calls, fetchFn };
}

test("signs in with the app credentials and sends from MAIL_FROM with the zip attached", async () => {
  const { calls, fetchFn } = fakeGraph();
  const mode = await sendOfficeEmail({ subject: "Week", html: "<p>hi</p>", attachments: [zip] }, env, fetchFn);
  assert.equal(mode, "sent");
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
  assert.equal(message.attachments[0].contentBytes, Buffer.from(zip.content).toString("base64"));
});

test("MAIL_TO overrides the recipient and accepts a list", async () => {
  const { calls, fetchFn } = fakeGraph();
  await sendOfficeEmail({ subject: "s", html: "h" }, { ...env, MAIL_TO: "a@x.com, b@x.com" }, fetchFn);
  const { message } = JSON.parse(String(calls[1].init.body));
  assert.deepEqual(message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address), ["a@x.com", "b@x.com"]);
});

test("reports Microsoft's error code, never the raw body", async () => {
  const { fetchFn } = fakeGraph(403);
  await assert.rejects(sendOfficeEmail({ subject: "s", html: "h" }, env, fetchFn), /Email send failed \(403\): ErrorAccessDenied/);
});

test("unconfigured in production is an error, not a silent mock", async () => {
  await assert.rejects(sendOfficeEmail({ subject: "s", html: "h" }, { NODE_ENV: "production" }), EmailNotConfiguredError);
});

test("unconfigured in development mock-sends", async () => {
  assert.equal(await sendOfficeEmail({ subject: "s", html: "h" }, { NODE_ENV: "development" }), "mock");
});
