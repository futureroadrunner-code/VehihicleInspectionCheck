# ASCA Vehicle Check

Daily vehicle inspection for ASCA technicians, installable as a phone app (PWA).
It runs on the same setup as DaVision: **Cloud Run + Firebase Hosting** in the
`davision-f9a1e` Google project, emailing the office through the **same
Microsoft 365 settings** (app registration + office mailbox).

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

## Deploy

From **Google Cloud Shell** (shell.cloud.google.com, signed in with the account
that manages DaVision):

```bash
git clone -b claude/zen-planck-7xs2bq https://github.com/futureroadrunner-code/VehihicleInspectionCheck
cd VehihicleInspectionCheck
./scripts/deploy.sh
```

The script:
1. copies `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` and
   `MAIL_FROM` from DaVision's Cloud Run service (`asca-vision`), without
   printing them;
2. builds and deploys the Cloud Run service `asca-vehicle-check`;
3. creates the Firebase Hosting site `asca-vehicle-check` (first run only) and
   publishes **https://asca-vehicle-check.web.app**.

Reports go to `mariob@ascaofficesolutions.com`. To change that, run
`MAIL_TO=someone@ascaofficesolutions.com ./scripts/deploy.sh`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Microsoft 365 sender tests
```

Without the M365 settings, local runs **mock-send**: the email is logged, and
with `MOCK_MAIL_DIR` set it's saved with its .zip. In production, missing
settings are an error ("this week was NOT sent"), so no week is silently
dropped.

## Layout

- `app/check/page.tsx` → `components/checklist-wizard.tsx`: inspect → photos → saved
- `components/week-strip.tsx`: Mon–Fri picker (today in red, saved/sent tags)
- `lib/local-db.ts`: on-phone storage for days and photos (IndexedDB)
- `lib/week-sender.ts`: when a week is due; sends it, never twice
- `lib/week-package.ts`: builds the week's .zip on the phone
- `lib/report-html.ts`: report layout shared by the email and the .zip
- `lib/email.ts`: Microsoft 365 (Graph) sender, same as DaVision's `server/taskMail.ts`
- `app/api/submit/route.ts`: receives a week and emails it
- `app/manifest.ts`, `public/sw.js`, `public/icon-*.png`: installable app
- `Dockerfile`, `firebase.json`, `scripts/deploy.sh`: Cloud Run + Firebase Hosting
