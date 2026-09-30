"use client";

import type { Incident, ZoneResult } from "./schema";
import type { ViewId } from "./zones";

// Everything a tech enters lives on the phone (IndexedDB) until the week is
// sent. One phone = one tech, so days are keyed by date.

export type StoredPhoto = { view: ViewId; blob: Blob; sizeBytes: number };

export type StoredDay = {
  date: string;
  weekOf: string;
  driverName: string;
  vehicleId: string;
  odometer: number;
  zones: Record<string, ZoneResult>;
  damageNotes?: string;
  incident?: Incident;
  photos: StoredPhoto[];
  photoCount: number;
  savedAt: string;
  /** Set once this day's report reached the office. */
  sentAt?: string;
};

export type StoredWeek = {
  weekOf: string;
  /** Set once the week summary email went out (after all days sent). */
  summarySentAt?: string;
};

const DB_NAME = "fleetcheck";
const DB_VERSION = 1;
const DAYS = "days";
const WEEKS = "weeks";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DAYS)) {
        const days = db.createObjectStore(DAYS, { keyPath: "date" });
        days.createIndex("weekOf", "weekOf");
      }
      if (!db.objectStoreNames.contains(WEEKS)) db.createObjectStore(WEEKS, { keyPath: "weekOf" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Could not open storage on this phone."));
    };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("Storage write was cancelled."));
      }),
  );
}

export function getDay(date: string): Promise<StoredDay | undefined> {
  return run<StoredDay | undefined>(DAYS, "readonly", (s) => s.get(date));
}

export async function putDay(day: StoredDay): Promise<void> {
  await run(DAYS, "readwrite", (s) => s.put(day));
}

export function daysInWeek(weekOf: string): Promise<StoredDay[]> {
  return run<StoredDay[]>(DAYS, "readonly", (s) => s.index("weekOf").getAll(weekOf)).then((d) =>
    d.sort((a, b) => a.date.localeCompare(b.date)),
  );
}

export function allDays(): Promise<StoredDay[]> {
  return run<StoredDay[]>(DAYS, "readonly", (s) => s.getAll());
}

export function getWeek(weekOf: string): Promise<StoredWeek | undefined> {
  return run<StoredWeek | undefined>(WEEKS, "readonly", (s) => s.get(weekOf));
}

export async function putWeek(week: StoredWeek): Promise<void> {
  await run(WEEKS, "readwrite", (s) => s.put(week));
}

/** Ask the browser not to clear our data when the phone runs low on space. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
