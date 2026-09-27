"use client";

import { addDays, format, fromISODate, isWeekday, mondayOf, workweek } from "@/lib/dates";

type Props = {
  today: string;
  selected: string;
  sent: Set<string>;
  onSelect: (iso: string) => void;
};

export function WeekStrip({ today, selected, sent, onSelect }: Props) {
  const monday = mondayOf(selected);
  const days = workweek(monday);
  const isCurrentWeek = monday === mondayOf(today);

  // Moving weeks keeps the same weekday, clamped so we never land in the future.
  function shiftWeek(delta: number) {
    const target = addDays(selected, delta * 7);
    onSelect(target > today ? today : target);
  }

  const selectedIsToday = selected === today;
  const weekLabel = isCurrentWeek
    ? `This week · ${format(monday, { month: "short", day: "numeric" })}`
    : `Week of ${format(monday, { month: "short", day: "numeric", year: fromISODate(monday).getFullYear() === fromISODate(today).getFullYear() ? undefined : "numeric" })}`;

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
          const isFuture = iso > today;
          const isSent = sent.has(iso);
          const cls = ["day", isToday && "is-today", isSent && "is-sent"].filter(Boolean).join(" ");
          const full = format(iso, { weekday: "long", month: "long", day: "numeric" });
          return (
            <button
              key={iso}
              type="button"
              className={cls}
              aria-pressed={iso === selected}
              aria-label={`${full}${isToday ? ", today" : ""}${isSent ? ", already sent" : ""}`}
              disabled={isFuture}
              onClick={() => onSelect(iso)}
            >
              <span className="day-name">{format(iso, { weekday: "short" })}</span>
              <span className="day-num">{fromISODate(iso).getDate()}</span>
              <span className="day-tag">{isToday ? "Today" : isSent ? "✓ Sent" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="week-selected">
        <strong>{format(selected, { weekday: "long", month: "long", day: "numeric" })}</strong>
        {selectedIsToday ? (
          <span className="is-today-note">Checking today</span>
        ) : (
          <span>
            Earlier day
            {sent.has(selected) ? " · already sent once" : ""}
            {isCurrentWeek && !isWeekday(today) ? ` · today is ${format(today, { weekday: "long" })}` : ""}
          </span>
        )}
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
