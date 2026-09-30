"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteFooter } from "./site-footer";
import { WeekStrip, type DayStatus } from "./week-strip";
import { VIEWS, ZONES, type ViewId, type ZoneId } from "@/lib/zones";
import { addDays, format, isWeekday, mondayOf, toISODate } from "@/lib/dates";
import { compressPhoto, formatBytes } from "@/lib/photos";
import { daysInWeek, getDay, getWeek, putDay, putWeek, requestPersistence, type StoredDay } from "@/lib/local-db";
import { dueWeeks, fridayOf, sendWeek, weekIsDue } from "@/lib/week-sender";
import type { Incident } from "@/lib/schema";

type Step = "form" | "photos" | "saved";
type ZoneState = Record<ZoneId, { status: "pass" | "attention"; note: string }>;
type Photo = { sizeBytes: number; blob: Blob; previewUrl: string };
type Notice = { tone: "ok" | "warn"; text: string } | null;

const IDENTITY_KEY = "fleetcheck:last-identity";

function freshZones(): ZoneState {
  return Object.fromEntries(ZONES.map((z) => [z.id, { status: "pass", note: "" }])) as ZoneState;
}

/** Default to today; on a weekend fall back to that week's Friday. */
function defaultDay(today: string): string {
  if (isWeekday(today)) return today;
  return addDays(mondayOf(today), 4);
}

function loadIdentity(): { driver: string; vehicle: string } {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { driver: String(v.driver ?? ""), vehicle: String(v.vehicle ?? "") };
    }
  } catch {
    // storage unavailable
  }
  return { driver: "", vehicle: "" };
}

function saveIdentity(driver: string, vehicle: string) {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ driver, vehicle }));
  } catch {
    // storage unavailable
  }
}

function joinList(items: string[]) {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const shortDay = (iso: string) => format(iso, { weekday: "long", month: "short", day: "numeric" });
const weekName = (weekOf: string) => `week of ${format(weekOf, { month: "short", day: "numeric" })}`;

export function ChecklistWizard() {
  // "Today" is resolved on the device after mount so a prerendered page can
  // never show the build day as today.
  const [today, setToday] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [date, setDate] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [odometer, setOdometer] = useState("");
  const [zones, setZones] = useState<ZoneState>(freshZones);
  const [notes, setNotes] = useState("");
  const [incidentOn, setIncidentOn] = useState(false);
  const [incidentTime, setIncidentTime] = useState("");
  const [incidentType, setIncidentType] = useState<Incident["type"] | "">("");
  const [incidentText, setIncidentText] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<ViewId, Photo>>>({});
  const [loaded, setLoaded] = useState<StoredDay | null>(null);
  const [weekStatus, setWeekStatus] = useState<Map<string, DayStatus>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [savedResult, setSavedResult] = useState<{ weekSent: boolean; weekError?: string } | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const weekOf = date ? mondayOf(date) : "";
  const weekLabel = weekOf ? format(weekOf, { month: "short", day: "numeric" }) : "";
  const locked = Boolean(loaded?.sentAt);
  const savedCount = [...weekStatus.values()].length;
  const sentCount = [...weekStatus.values()].filter((s) => s === "sent").length;

  const refreshWeek = useCallback(async (w: string) => {
    if (!w) return;
    const days = await daysInWeek(w);
    setWeekStatus(new Map(days.map((d) => [d.date, d.sentAt ? "sent" : "saved"])));
  }, []);

  // Send any finished week that still has unsent reports.
  const flushDue = useCallback(
    async (t: string) => {
      let weeks: string[];
      try {
        weeks = await dueWeeks(t);
      } catch {
        return;
      }
      for (const w of weeks) {
        setNotice({ tone: "ok", text: `Sending the ${weekName(w)} to the office…` });
        try {
          const r = await sendWeek(w);
          setNotice({
            tone: "ok",
            text: `The ${weekName(w)} was sent to the office${r.daysSent ? ` (${r.daysSent} day${r.daysSent === 1 ? "" : "s"})` : ""}.`,
          });
        } catch (e) {
          setNotice({ tone: "warn", text: `The ${weekName(w)} is saved but not sent yet: ${(e as Error).message}` });
          break;
        }
      }
      if (weekOf) await refreshWeek(weekOf);
    },
    [refreshWeek, weekOf],
  );

  useEffect(() => {
    const t = toISODate();
    setToday(t);
    setDate(defaultDay(t));
    const id = loadIdentity();
    setDriver(id.driver);
    setVehicle(id.vehicle);
    void requestPersistence();
  }, []);

  // Catch up on unsent weeks when the app opens and whenever the phone reconnects.
  useEffect(() => {
    if (!today) return;
    void flushDue(today);
    const onOnline = () => void flushDue(toISODate());
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // Only on open; flushDue identity changes with the selected week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    void refreshWeek(weekOf);
  }, [weekOf, refreshWeek]);

  // Picking a day loads what's saved for it, or starts a blank checklist.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    getDay(date)
      .catch(() => undefined)
      .then((day) => {
        if (cancelled) return;
        for (const p of Object.values(photosRef.current)) if (p) URL.revokeObjectURL(p.previewUrl);
        setLoaded(day ?? null);
        setError(null);
        if (!day) {
          setZones(freshZones());
          setOdometer("");
          setNotes("");
          setIncidentOn(false);
          setIncidentTime("");
          setIncidentType("");
          setIncidentText("");
          setPhotos({});
          return;
        }
        setDriver(day.driverName);
        setVehicle(day.vehicleId);
        setOdometer(String(day.odometer));
        const z = freshZones();
        for (const id of Object.keys(z) as ZoneId[]) {
          const r = day.zones[id];
          if (r) z[id] = { status: r.status, note: r.note ?? "" };
        }
        setZones(z);
        setNotes(day.damageNotes ?? "");
        setIncidentOn(Boolean(day.incident));
        setIncidentTime(day.incident?.time ?? "");
        setIncidentType(day.incident?.type ?? "");
        setIncidentText(day.incident?.description ?? "");
        setPhotos(
          Object.fromEntries(
            day.photos.map((p) => [p.view, { sizeBytes: p.sizeBytes, blob: p.blob, previewUrl: URL.createObjectURL(p.blob) }]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const failedCount = ZONES.filter((z) => zones[z.id].status === "attention").length;

  function setZone(id: ZoneId, patch: Partial<ZoneState[ZoneId]>) {
    setZones((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function addPhoto(view: ViewId, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setCompressing(true);
    try {
      const { blob, sizeBytes } = await compressPhoto(file);
      const previewUrl = URL.createObjectURL(blob);
      setPhotos((prev) => {
        const old = prev[view];
        if (old) URL.revokeObjectURL(old.previewUrl);
        return { ...prev, [view]: { sizeBytes, blob, previewUrl } };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compress photo.");
    } finally {
      setCompressing(false);
    }
  }

  function removePhoto(view: ViewId) {
    setPhotos((prev) => {
      const old = prev[view];
      if (!old) return prev;
      URL.revokeObjectURL(old.previewUrl);
      const next = { ...prev };
      delete next[view];
      return next;
    });
  }

  function continueToPhotos() {
    setError(null);
    if (!driver.trim() || !vehicle.trim() || !date || !odometer) {
      setError("Fill in driver, vehicle, and odometer before continuing.");
      return;
    }
    if (today && date > today) {
      setError("Pick today or a day already worked.");
      return;
    }
    const odo = Number(odometer);
    if (!Number.isFinite(odo) || odo < 0 || !Number.isInteger(odo)) {
      setError("Odometer must be a whole number.");
      return;
    }
    if (incidentOn && (!incidentTime.trim() || !incidentType || !incidentText.trim())) {
      setError("Incident needs time, type, and description — or close it.");
      return;
    }
    saveIdentity(driver.trim(), vehicle.trim());
    setStep("photos");
    window.scrollTo({ top: 0 });
  }

  async function saveDayLocally() {
    setError(null);
    const missing = VIEWS.filter((v) => !photos[v.id]);
    if (missing.length > 0) {
      const names = missing.map((v) => v.label.toLowerCase());
      setError(names.length === 1 ? `Add the ${names[0]} photo.` : `Add photos for the ${joinList(names)}.`);
      return;
    }
    if (!today) return;

    setBusy("Saving on this phone…");
    const day: StoredDay = {
      date,
      weekOf,
      driverName: driver.trim(),
      vehicleId: vehicle.trim(),
      odometer: Number(odometer),
      zones: Object.fromEntries(
        ZONES.map((z) => [z.id, { status: zones[z.id].status, note: zones[z.id].note.trim() || undefined }]),
      ),
      damageNotes: notes.trim() || undefined,
      incident:
        incidentOn && incidentType
          ? { time: incidentTime.trim(), type: incidentType, description: incidentText.trim() }
          : undefined,
      photos: VIEWS.map((v) => ({ view: v.id, blob: photos[v.id]!.blob, sizeBytes: photos[v.id]!.sizeBytes })),
      photoCount: VIEWS.length,
      savedAt: new Date().toISOString(),
    };

    try {
      await putDay(day);
      // A day added after the summary went out means the summary is stale.
      if ((await getWeek(weekOf))?.summarySentAt) await putWeek({ weekOf });
    } catch {
      setBusy(null);
      setError("Could not save on this phone. Check that the phone isn’t out of storage, then try again.");
      return;
    }
    setLoaded(day);
    await refreshWeek(weekOf);

    let result: { weekSent: boolean; weekError?: string } = { weekSent: false };
    const days = await daysInWeek(weekOf);
    if (weekIsDue(weekOf, days, today)) {
      setBusy("Week complete — sending all reports to the office…");
      try {
        await sendWeek(weekOf);
        result = { weekSent: true };
      } catch (e) {
        result = { weekSent: false, weekError: (e as Error).message };
      }
      await refreshWeek(weekOf);
    }
    setBusy(null);
    setSavedResult(result);
    setStep("saved");
    window.scrollTo({ top: 0 });
  }

  async function sendWeekNow() {
    setError(null);
    const pending = [...weekStatus.values()].filter((s) => s === "saved").length;
    if (pending === 0) return;
    const ok = window.confirm(
      `Send ${pending} saved day${pending === 1 ? "" : "s"} for the ${weekName(weekOf)} to the office now? ` +
        "Days you add later this week are sent at the end of the week.",
    );
    if (!ok) return;
    setBusy("Sending this week to the office…");
    try {
      const r = await sendWeek(weekOf);
      setNotice({ tone: "ok", text: `Sent ${r.daysSent} day${r.daysSent === 1 ? "" : "s"} to the office.` });
    } catch (e) {
      setNotice({ tone: "warn", text: (e as Error).message });
    }
    await refreshWeek(weekOf);
    setBusy(null);
  }

  function backToWeek() {
    const t = toISODate();
    setToday(t);
    setSavedResult(null);
    setStep("form");
    // Jump to the next day that still needs a checklist, else stay put.
    const next = [0, 1, 2, 3, 4].map((i) => addDays(mondayOf(date), i)).find((d) => d <= t && !weekStatus.has(d));
    setDate(next ?? defaultDay(t));
    window.scrollTo({ top: 0 });
  }

  const topline = (
    <div className="topline">
      <Link href="/">ASCA · Vehicle Check</Link>
      {weekLabel ? <span>Week of {weekLabel}</span> : null}
    </div>
  );

  const stages = (
    <ol className="stage-index" aria-label="Check progress">
      {(["form", "photos", "saved"] as Step[]).map((s, i) => {
        const order = { form: 0, photos: 1, saved: 2 }[step];
        return (
          <li
            key={s}
            className={i === order ? "on" : i < order ? "done" : undefined}
            aria-current={i === order ? "step" : undefined}
          >
            {String(i + 1).padStart(2, "0")} {["Inspect", "Photos", "Saved"][i]}
          </li>
        );
      })}
    </ol>
  );

  const messages = (
    <>
      {error ? (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="sheet-status" role="status">
          {busy}
        </p>
      ) : null}
    </>
  );

  const noticeBar = notice ? (
    <p className={`notice notice-${notice.tone}`} role="status">
      {notice.text}
    </p>
  ) : null;

  if (!today) {
    return (
      <div className="page">
        <main className="doc-wrap" aria-busy="true">
          {topline}
        </main>
      </div>
    );
  }

  if (step === "saved") {
    const friday = shortDay(fridayOf(weekOf));
    return (
      <div className="page">
        <main className="doc-wrap animate-rise">
          {topline}
          {stages}
          <header className="folio-head" style={{ marginTop: "var(--space-xl)" }}>
            <p className="folio-num">OK</p>
            <div>
              <p className="folio-brand">ASCA Office Solutions</p>
              <h1>{savedResult?.weekSent ? "Saved and week sent" : "Day saved"}</h1>
              <p className="folio-lede">
                {shortDay(date)} is saved on this phone with its {VIEWS.length} photos.{" "}
                {savedResult?.weekSent
                  ? `The ${weekName(weekOf)} is complete and all its reports went to the office.`
                  : savedResult?.weekError
                    ? `The week is complete but couldn’t be sent yet (${savedResult.weekError}) It will send automatically next time the app is open with a connection.`
                    : `Nothing has been sent yet. All of this week’s reports go to the office together after ${friday}.`}
              </p>
            </div>
          </header>
          <hr className="chapter-rule" />
          <p className="step-note">
            This week: {savedCount} of 5 days saved{sentCount ? ` · ${sentCount} sent` : ""}.
          </p>
          <div className="sheet-actions">
            <Link className="back" href="/">
              Done
            </Link>
            <button type="button" className="next" onClick={backToWeek}>
              Back to week ›
            </button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (step === "photos") {
    const photoCount = VIEWS.filter((v) => photos[v.id]).length;
    const photoBytes = VIEWS.reduce((n, v) => n + (photos[v.id]?.sizeBytes ?? 0), 0);
    return (
      <div className="page">
        <main className="doc-wrap animate-rise">
          {topline}
          {stages}
          <header className="folio-head" style={{ marginTop: "var(--space-xl)" }}>
            <p className="folio-num">02</p>
            <div>
              <p className="folio-brand">ASCA Office Solutions</p>
              <h1>Proof photos</h1>
              <p className="folio-lede">
                One photo of each side for {shortDay(date)}. Photos stay on this phone until the week is sent.
              </p>
            </div>
          </header>
          <hr className="chapter-rule" />

          <div className="view-grid">
            {VIEWS.map((v) => {
              const p = photos[v.id];
              return (
                <div key={v.id} className="view-slot">
                  <label className={`dropzone${p ? " has-photo" : ""}`}>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      disabled={compressing}
                      onChange={(e) => {
                        addPhoto(v.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                    {p ? (
                      <img src={p.previewUrl} alt={`${v.label} of vehicle`} />
                    ) : (
                      <span className="dropzone-title">{compressing ? "Compressing…" : v.label}</span>
                    )}
                    <span className="dropzone-sub">
                      {p ? `${v.label} · ${formatBytes(p.sizeBytes)}` : "Tap to take photo"}
                    </span>
                  </label>
                  {p ? (
                    <button type="button" className="photo-remove" onClick={() => removePhoto(v.id)}>
                      Retake {v.label.toLowerCase()}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="step-note">
            {photoCount} of {VIEWS.length} sides · {formatBytes(photoBytes)} total
          </p>

          {messages}

          <div className="sheet-actions sticky">
            <button
              type="button"
              className="back"
              onClick={() => {
                setError(null);
                setStep("form");
              }}
              disabled={Boolean(busy)}
            >
              ‹ Back
            </button>
            <button type="button" className="next" onClick={saveDayLocally} disabled={Boolean(busy) || compressing}>
              {busy ? "Saving…" : "Save day ›"}
            </button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="page">
      <main className="doc-wrap animate-rise">
        {topline}
        {stages}
        <p className="fill-legend">
          <span className="swatch" aria-hidden="true" /> Highlighted boxes are still empty.
          <span className="req">*</span> = required.
        </p>
        {noticeBar}

        <header className="folio-head">
          <p className="folio-num">01</p>
          <div>
            <p className="folio-brand">ASCA Office Solutions</p>
            <h1>Vehicle checklist</h1>
            <p className="folio-lede">Save each day on this phone. The whole week goes to the office after Friday.</p>
          </div>
        </header>
        <hr className="chapter-rule" />

        <h2 className="sub-step" style={{ marginTop: 0 }}>
          <span>1</span>Which day?
        </h2>
        <WeekStrip today={today} selected={date} status={weekStatus} onSelect={setDate} />
        <div className="week-progress">
          <p>
            <strong>{savedCount} of 5</strong> days saved
            {sentCount ? ` · ${sentCount} sent` : ""}
            {savedCount > sentCount ? ` · sends after ${format(fridayOf(weekOf), { weekday: "long" })}` : ""}
          </p>
          {savedCount > sentCount ? (
            <button type="button" className="text-link" onClick={sendWeekNow} disabled={Boolean(busy)}>
              Send week now
            </button>
          ) : null}
        </div>

        {locked ? (
          <>
            <h2 className="sub-step">
              <span>✓</span>Already sent
            </h2>
            <p className="step-note">
              {shortDay(date)} was sent to the office
              {loaded?.sentAt ? ` on ${format(toISODate(new Date(loaded.sentAt)), { month: "short", day: "numeric" })}` : ""}.
              Odometer {loaded?.odometer.toLocaleString("en-US")} ·{" "}
              {failedCount === 0 ? "all 11 passed" : `${failedCount} failed: ${ZONES.filter((z) => zones[z.id].status === "attention").map((z) => z.label).join(", ")}`}
              . Sent days can’t be changed.
            </p>
            {messages}
          </>
        ) : (
          <>
            {loaded ? (
              <p className="notice notice-ok">Saved on this phone — you can still make changes until the week is sent.</p>
            ) : null}

            <h2 className="sub-step">
              <span>2</span>Driver &amp; vehicle
            </h2>
            <div className="field-grid">
              <label className="field span-6">
                <span>
                  Driver name <span className="req">*</span>
                </span>
                <input
                  value={driver}
                  onChange={(e) => setDriver(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  required
                />
              </label>
              <label className="field span-6">
                <span>
                  Vehicle ID / plate <span className="req">*</span>
                </span>
                <input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="UNIT-12 · ABC-1234"
                  autoCapitalize="characters"
                  required
                />
              </label>
              <label className="field span-6">
                <span>
                  Odometer <span className="req">*</span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  placeholder="48210"
                  min={0}
                  required
                />
                <em className="hint">Miles, as shown on the dash</em>
              </label>
            </div>

            <h2 className="sub-step">
              <span>3</span>Walk-around
              <span className={`aside${failedCount ? " flag" : ""}`}>
                {failedCount === 0 ? "All 11 pass" : `${failedCount} failed`}
              </span>
            </h2>
            <div className="zones">
              {ZONES.map((z, i) => {
                const s = zones[z.id];
                const bad = s.status === "attention";
                return (
                  <div key={z.id} className={`zone${bad ? " is-attention" : ""}`}>
                    <div className="zone-head">
                      <span className="zone-num">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="zone-name">{z.label}</h3>
                      <p className="zone-hint">{z.hint}</p>
                    </div>
                    <div className="seg" role="radiogroup" aria-label={z.label}>
                      <button
                        type="button"
                        role="radio"
                        className="seg-opt"
                        aria-checked={!bad}
                        data-value="pass"
                        onClick={() => setZone(z.id, { status: "pass" })}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        role="radio"
                        className="seg-opt"
                        aria-checked={bad}
                        data-value="attention"
                        onClick={() => setZone(z.id, { status: "attention" })}
                      >
                        Fail
                      </button>
                    </div>
                    {bad ? (
                      <label className="field">
                        <span>What’s the issue?</span>
                        <input
                          value={s.note}
                          onChange={(e) => setZone(z.id, { note: e.target.value })}
                          placeholder="Where and what’s wrong"
                          maxLength={500}
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <h2 className="sub-step">
              <span>4</span>Issues &amp; incidents
            </h2>
            <div className="field-grid">
              <label className="field">
                <span>Other issues / maintenance notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything else the shop should know"
                  rows={4}
                  maxLength={2000}
                />
                <em className="hint">Optional</em>
              </label>
            </div>
            <div className={`feat${incidentOn ? " open" : ""}`}>
              <button type="button" aria-expanded={incidentOn} onClick={() => setIncidentOn((v) => !v)}>
                <span className="feat-sign" aria-hidden="true">
                  {incidentOn ? "−" : "+"}
                </span>
                <span>
                  Record an incident
                  <span className="feat-sub">Damage, near-miss, or breakdown on this day</span>
                </span>
              </button>
              <div className="panel">
                <div className="field-grid">
                  <label className="field span-6">
                    <span>
                      Time <span className="req">*</span>
                    </span>
                    <input type="time" value={incidentTime} onChange={(e) => setIncidentTime(e.target.value)} />
                  </label>
                  <label className="field span-6">
                    <span>
                      Type <span className="req">*</span>
                    </span>
                    <select
                      value={incidentType}
                      onChange={(e) => setIncidentType(e.target.value as Incident["type"] | "")}
                    >
                      <option value="">Select…</option>
                      <option value="damage">Damage</option>
                      <option value="near-miss">Near-miss</option>
                      <option value="mechanical">Mechanical</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Description <span className="req">*</span>
                    </span>
                    <textarea
                      value={incidentText}
                      onChange={(e) => setIncidentText(e.target.value)}
                      rows={3}
                      placeholder="What happened"
                      maxLength={2000}
                    />
                  </label>
                </div>
              </div>
            </div>

            {messages}

            <p className="step-note">Next: four photos — front, back, and both sides. Then save the day.</p>
            <div className="sheet-actions sticky">
              <span />
              <button type="button" className="next" onClick={continueToPhotos}>
                Continue ›
              </button>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
