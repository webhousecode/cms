"use client";

import { type CSSProperties } from "react";
import { CustomDateInput } from "./custom-date-input";
import { CustomTimeInput } from "./custom-time-input";

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
  min?: string;
  max?: string;
}

function parse(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/.exec(v);
  if (m) return { date: m[1], time: m[2] };
  const dOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(v);
  if (dOnly) return { date: dOnly[1], time: "" };
  return { date: "", time: "" };
}

function combine(date: string, time: string): string {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

export function CustomDateTimeInput({ value, onChange, disabled = false, style, min, max }: Props) {
  const { date, time } = parse(value);

  const minDate = min ? parse(min).date : undefined;
  const maxDate = max ? parse(max).date : undefined;

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", ...style }}>
      <div style={{ flex: 2 }}>
        <CustomDateInput
          value={date}
          disabled={disabled}
          min={minDate}
          max={maxDate}
          onChange={(d) => onChange(combine(d, time))}
        />
      </div>
      <div style={{ flex: 1 }}>
        <CustomTimeInput
          value={time}
          disabled={disabled || !date}
          onChange={(t) => onChange(combine(date, t))}
        />
      </div>
    </div>
  );
}
