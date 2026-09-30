# FleetCheck

Daily vehicle inspection for ASCA technicians, installable as a phone app (PWA).

## How the week works

1. Each day the tech fills in the checklist (pass / fail per item, issue notes,
   optional incident) and takes four photos, then taps **Save day**.
2. The day, including its photos, is stored **on the phone** (IndexedDB).
   Nothing is emailed yet. Saved days can still be edited until the week is sent.
3. The week is sent automatically once it's finished: when all five weekdays
   are saved, when Friday is saved, or the next time the app is opened after
   Friday. Each day goes out as its own email with its photos, followed by one
   week-summary email. If there's no signal, it retries when the phone
   reconnects or the app is next opened.
4. Days that were sent are locked, and their photos are removed from the phone
   to free up space.

The tech can also tap **Send week now** to send the saved days early.

Web apps can't wake up on a schedule on phones (iOS doesn't allow it), so
sending happens when the app is in use. Installing it to the home screen
keeps the saved data from being cleared by the browser, and the app opens
without signal (service worker in `public/sw.js`).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Without SMTP settings the API runs in **mock mode** during local
development. It validates the report and logs it, but sends no email, and
the success screen says "test mode". In production a missing `SMTP_HOST` is
an error instead, so reports are never silently dropped. Set
`ALLOW_MOCK_EMAIL=true` to allow mock mode on a preview deploy.

## Email settings

Copy `.env.example` to `.env.local` locally, or set the same variables in
Netlify under **Site configuration → Environment variables**:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server. Unset means mock mode. |
| `SMTP_PORT` | Defaults to 587. |
| `SMTP_USER` / `SMTP_PASS` | SMTP login. |
| `SMTP_SECURE` | `true` for implicit TLS (port 465). |
| `MAIL_FROM` | From address. Defaults to `SMTP_USER`. |
| `MAIL_TO` | Who receives reports. Defaults to `mariob@ascaofficesolutions.com`. |

## Layout

- Theme matches the ASCA Site Survey (Schibsted Grotesk, black ink, red `#e10600` accent, square corners).
- `app/page.tsx`: landing page
- `app/check/page.tsx` → `components/checklist-wizard.tsx`: inspect → photos → sent
- `components/week-strip.tsx`: Mon–Fri day picker (today highlighted, date under each day)
- `app/api/submit/route.ts`: validates and emails daily and week reports
- `lib/local-db.ts`: on-device storage for days and photos (IndexedDB)
- `lib/week-sender.ts`: decides when a week is due and sends it, never twice
- `app/manifest.ts`, `public/sw.js`, `public/icon-*.png`: installable app
