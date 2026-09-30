# ASCA Vehicle Check

Daily vehicle inspection for ASCA technicians, installable as a phone app (PWA).
It runs on **Cloudflare** (a Worker serving the static app plus one
`/api/submit` endpoint) and emails the office through the **same Microsoft 365
settings as DaVision** (app registration + office mailbox). SMTP2GO's web API
also works as an alternative.

## How the week works

1. Each day the tech marks every item **Pass / Fail** (with the issue for any
   fail), adds other issues or an incident, takes four photos, and taps
   **Save day**. Everything, photos included, is stored **on the phone**
   (IndexedDB). Nothing is sent that day, and saved days can still be edited.
2. The week is sent once it's finished: when all five weekdays are saved, when
   Friday is saved, or the next time the app is opened after Friday.
3. The phone zips the week (one folder per day with its report page and
   photos, plus a week summary) and sends **one email** to the office. The
   email body shows the whole week and the .zip is attached. Photos are
   compressed on the phone (≤120 KB each), so a full week is about 2–2.5 MB
   and fits Microsoft 365's ~4 MB limit. In the rare case it doesn't fit, it
   goes as "part 1 of 2", and so on.
4. Sent days are locked and their photos removed from the phone. If there's no
   signal, the week stays saved and sends when the phone reconnects. Nothing
   is ever sent twice.

The tech can also tap **Send week now** to send early. Phones don't let web
apps wake up on a schedule, so sending happens whenever the app is in use.
Installing it to the home screen keeps saved weeks from being cleared.

## Deploy (Cloudflare)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository** → GitHub → `VehihicleInspectionCheck`.
   - Branch: `claude/zen-planck-7xs2bq` (or `main` once merged)
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
2. After the first deploy: the project → **Settings → Variables and Secrets →
   Add**, then redeploy:

   | Type | Name | Value |
   |---|---|---|
   | Text | `M365_TENANT_ID` | same as DaVision |
   | Text | `M365_CLIENT_ID` | same as DaVision |
   | **Secret** | `M365_CLIENT_SECRET` | same as DaVision |
   | Text | `MAIL_FROM` | same as DaVision (the office mailbox) |
   | Text | `MAIL_TO` | `mariob@ascaofficesolutions.com` |

   DaVision's values are in Google Cloud Console → Cloud Run → `asca-vision`
   → **Edit & deploy new revision → Variables & Secrets**.
   To use SMTP2GO instead, add a **Secret** `SMTP2GO_API_KEY` (and a
   `MAIL_FROM` verified in SMTP2GO); it takes priority over Microsoft 365.

`wrangler.jsonc` sets `keep_vars`, so deploys never wipe these settings.
Each weekly send uses about 5 ms of Worker CPU, which fits the free plan's
10 ms. If the logs ever show "exceeded CPU", the $5/month Workers plan
removes that limit.

## Run locally

```bash
npm install
npm run dev        # pages only, http://localhost:3000
npm run preview    # full app in Cloudflare's local runtime, incl. /api/submit
npm test           # email sender tests (Microsoft 365 + SMTP2GO)
```

For `npm run preview`, put `ALLOW_MOCK_EMAIL=true` in `.dev.vars` to log
emails instead of sending them. On the live site, missing email settings are
an error ("this week was NOT sent"), so no week is silently dropped.

## Layout

- `app/check/page.tsx` → `components/checklist-wizard.tsx`: inspect → photos → saved
- `components/week-strip.tsx`: Mon–Fri picker (today in red, saved/sent tags)
- `lib/local-db.ts`: on-phone storage for days and photos (IndexedDB)
- `lib/week-sender.ts`: when a week is due; sends it, never twice
- `lib/week-package.ts`: builds the week's .zip on the phone
- `lib/report-html.ts`: report layout shared by the email and the .zip
- `lib/email.ts`: Microsoft 365 (Graph) sender, same as DaVision's `server/taskMail.ts`, or SMTP2GO
- `worker/index.ts`: Cloudflare Worker: serves `out/` and handles `/api/submit`
- `app/manifest.ts`, `public/sw.js`, `public/icon-*.png`: installable app
- `wrangler.jsonc`, `public/_headers`: Cloudflare config
