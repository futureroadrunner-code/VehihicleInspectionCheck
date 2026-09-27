export type ZoneId =
  | "exterior"
  | "tires"
  | "lights"
  | "fluids"
  | "interior"
  | "safety"
  | "brakes"
  | "fuel"
  | "wipers"
  | "mirrors"
  | "horn";

export type Zone = { id: ZoneId; label: string; hint: string };

// Words only — no reference photos, so nothing on screen can disagree with
// the actual truck being inspected.
export const ZONES: Zone[] = [
  { id: "exterior", label: "Exterior body", hint: "Dents, scrapes, panels, doors" },
  { id: "tires", label: "Tires & wheels", hint: "Tread, pressure, sidewalls, lug nuts" },
  { id: "lights", label: "Lights & indicators", hint: "Head, brake, turn, hazard" },
  { id: "fluids", label: "Fluids & leaks", hint: "Oil, coolant, drips under the truck" },
  { id: "interior", label: "Interior", hint: "Seats, belts, dash warnings, cleanliness" },
  { id: "safety", label: "Safety gear", hint: "Extinguisher, first aid, triangles, vest" },
  { id: "brakes", label: "Brakes", hint: "Pedal feel, parking brake, noises" },
  { id: "fuel", label: "Fuel & fuel cap", hint: "Level, cap sealed" },
  { id: "wipers", label: "Wipers & washer fluid", hint: "Blades, spray, fluid level" },
  { id: "mirrors", label: "Mirrors", hint: "Side and rear-view, cracks, adjustment" },
  { id: "horn", label: "Horn", hint: "Sounds clearly" },
];

export const VIEWS = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];
