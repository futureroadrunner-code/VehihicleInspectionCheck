# FleetCheck

Daily vehicle inspection for ASCA technicians. Each day's checklist is emailed
to the shop; on Friday the week rollup is sent from the phone's local backup.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Without SMTP settings the API runs in **mock mode**. It validates the
report and logs it, but sends no email, and the success screen says "test mode".

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
| `MAIL_TO` | Shop inbox. Defaults to `service@ascaofficesolutions.com`. |

## Layout

- `app/page.tsx`: landing page
- `app/check/page.tsx` → `components/checklist-wizard.tsx`: inspect → photos → sent
- `components/week-strip.tsx`: Mon–Fri day picker (today highlighted, date under each day)
- `app/api/submit/route.ts`: validates and emails daily and week reports
- `lib/week-store.ts`: on-device week backup (localStorage keys unchanged from v1)
