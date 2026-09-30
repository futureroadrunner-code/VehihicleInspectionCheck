"use client";

import { addDays, format, fromISODate, isWeekday, mondayOf, workweek } from "@/lib/dates";

export type DayStatus = "saved" | "sent";

type Props = {
  today: string;
  selected: string;
  status: Map<string, DayStatus>;
  onSelect: (iso: string) => void;
};

export function WeekStrip({ today, selected, status, onSelect }: Props) {
  const monday = mondayOf(selected);
  const days = workweek(monday);
  const isCurrentWeek = monday === mondayOf(today);

  // Moving weeks keeps the same weekday, clamped so we never land in the future.
  function shiftWeek(delta: number) {
    const target = addDays(selected, delta * 7);
    onSelect(target > today ? today : target);
  }

  const selectedIsToday = selected === today;
  const sameYear = fromISODate(monday).getFullYear() === fromISODate(today).getFullYear();
  const weekLabel = isCurrentWeek
    ? `This week · ${format(monday, { month: "short", day: "numeric" })}`
    : `Week of ${format(monday, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" })}`;
  const selectedStatus = status.get(selected);

  return (
    <div className="week">
      <div className="week-nav">
        <button type="button" className="week-arrow" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ‹
        </button>
        <p className="week-label" aria-live="polite">
          {weekLabel}
        </p>
        <button
          type="button"
          className="week-arrow"
          onClick={() => shiftWeek(1)}
          disabled={isCurrentWeek}
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      <div className="week-days" role="group" aria-label="Inspection day">
        {days.map((iso) => {
          const isToday = iso === today;
          const s = status.get(iso);
          const cls = ["day", isToday && "is-today", s && `is-${s}`].filter(Boolean).join(" ");
          const full = format(iso, { weekday: "long", month: "long", day: "numeric" });
          const tag = isToday ? "Today" : s === "sent" ? "✓ Sent" : s === "saved" ? "Saved" : "";
          return (
            <button
              key={iso}
              type="button"
              className={cls}
              aria-pressed={iso === selected}
              aria-label={`${full}${isToday ? ", today" : ""}${s ? `, ${s}` : ""}`}
              disabled={iso > today}
              onClick={() => onSelect(iso)}
            >
              <span className="day-name">{format(iso, { weekday: "short" })}</span>
              <span className="day-num">{fromISODate(iso).getDate()}</span>
              <span className="day-tag">{tag}</span>
              {isToday && s ? <span className="day-dot" aria-hidden="true" data-status={s} /> : null}
            </button>
          );
        })}
      </div>

      <div className="week-selected">
        <strong>{format(selected, { weekday: "long", month: "long", day: "numeric" })}</strong>
        <span className={selectedIsToday ? "is-today-note" : undefined}>
          {selectedIsToday ? "Checking today" : "Earlier day"}
          {selectedStatus === "saved" ? " · saved on this phone" : ""}
          {selectedStatus === "sent" ? " · sent to the office" : ""}
          {isCurrentWeek && !isWeekday(today) && !selectedIsToday ? ` · today is ${format(today, { weekday: "long" })}` : ""}
        </span>
      </div>
      <p className="week-legend" aria-hidden="true">
        <span>
          <i className="sw-today" />
          Today
        </span>
        <span>
          <i className="sw-selected" />
          Checklist day
        </span>
      </p>
    </div>
  );
}
