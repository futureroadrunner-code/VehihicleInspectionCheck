import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const zoneResultSchema = z.object({
  status: z.enum(["pass", "attention"]),
  note: z.string().max(500).optional(),
});

export const incidentSchema = z.object({
  time: z.string().trim().min(1).max(20),
  type: z.enum(["damage", "near-miss", "mechanical", "other"]),
  description: z.string().trim().min(1).max(2000),
});

export const reportDaySchema = z.object({
  date: isoDate,
  odometer: z.number().int().min(0).max(9_999_999),
  zones: z.record(z.string(), zoneResultSchema),
  damageNotes: z.string().max(2000).optional(),
  incident: incidentSchema.optional(),
  photoCount: z.number().int().min(0).max(8),
});

export const weekSchema = z.object({
  mode: z.literal("week"),
  weekOf: isoDate,
  driverName: z.string().trim().min(1).max(120),
  vehicleId: z.string().trim().min(1).max(80),
  part: z.number().int().min(1).max(10),
  parts: z.number().int().min(1).max(10),
  days: z.array(reportDaySchema).min(1).max(7),
});

export type ZoneResult = z.infer<typeof zoneResultSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type WeekReport = z.infer<typeof weekSchema>;
