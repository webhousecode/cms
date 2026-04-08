/**
 * Tiny cron expression evaluator for the agent scheduler.
 *
 * Supports the standard 5-field cron format:
 *
 *   minute  hour  day-of-month  month  day-of-week
 *   0-59    0-23  1-31          1-12   0-6 (0 = Sunday)
 *
 * Each field accepts:
 *   - `*`         every value
 *   - `5`         literal value
 *   - `1,3,5`     comma-separated list
 *   - `1-5`       inclusive range
 *   - `*\/15`     step (every 15)
 *   - `0-30/5`    step over a range
 *
 * Not supported (intentionally — keeps the parser tiny and the scheduler
 * predictable): named months/days, weekday names, `L`, `W`, `#`,
 * 6-field with seconds, 7-field with year.
 *
 * Used by `isScheduleDue` in scheduler.ts when an agent or workflow has
 * `schedule.frequency === "cron"` set. The scheduler ticks every 5
 * minutes so cron expressions finer than that are silently coarsened
 * (e.g. `*\/1` behaves like `*\/5`).
 */

const FIELD_RANGES: Record<string, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
};

type FieldName = keyof typeof FIELD_RANGES;
const FIELD_ORDER: FieldName[] = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];

/**
 * Parse one cron field into the set of values it matches.
 * Returns null on parse failure (caller treats as "doesn't match").
 */
function parseField(input: string, field: FieldName): Set<number> | null {
  const [min, max] = FIELD_RANGES[field];
  const result = new Set<number>();

  // Split on comma for lists like "1,3,5"
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) return null;

    // Step syntax: "*/N" or "A-B/N"
    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    let body = trimmed;
    let step = 1;
    if (stepMatch) {
      body = stepMatch[1]!;
      step = parseInt(stepMatch[2]!, 10);
      if (!step || step < 1) return null;
    }

    // Wildcard
    if (body === "*") {
      for (let v = min; v <= max; v += step) result.add(v);
      continue;
    }

    // Range "A-B"
    const rangeMatch = body.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1]!, 10);
      const b = parseInt(rangeMatch[2]!, 10);
      if (a < min || b > max || a > b) return null;
      for (let v = a; v <= b; v += step) result.add(v);
      continue;
    }

    // Single literal
    const literal = parseInt(body, 10);
    if (Number.isNaN(literal) || literal < min || literal > max) return null;
    result.add(literal);
  }

  return result.size > 0 ? result : null;
}

interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
}

/**
 * Parse a cron expression. Returns null if invalid.
 * Exported for the UI to validate input as the user types.
 */
export function parseCron(expression: string): ParsedCron | null {
  if (!expression || typeof expression !== "string") return null;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minute = parseField(fields[0]!, "minute");
  const hour = parseField(fields[1]!, "hour");
  const dayOfMonth = parseField(fields[2]!, "dayOfMonth");
  const month = parseField(fields[3]!, "month");
  const dayOfWeek = parseField(fields[4]!, "dayOfWeek");
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Test whether a date matches a cron expression.
 *
 * Standard cron behaviour: when both day-of-month AND day-of-week are
 * restricted (neither is `*`), the schedule fires when EITHER matches
 * (Vixie cron semantics). When one is `*`, only the other applies.
 */
export function cronMatches(expression: string, date: Date = new Date()): boolean {
  const parsed = parseCron(expression);
  if (!parsed) return false;

  if (!parsed.minute.has(date.getMinutes())) return false;
  if (!parsed.hour.has(date.getHours())) return false;
  if (!parsed.month.has(date.getMonth() + 1)) return false;

  // Day-of-month + day-of-week with the OR semantics
  const domStar = parsed.dayOfMonth.size === 31; // covers full range
  const dowStar = parsed.dayOfWeek.size === 7;
  const domMatch = parsed.dayOfMonth.has(date.getDate());
  const dowMatch = parsed.dayOfWeek.has(date.getDay());

  if (domStar && dowStar) return true;
  if (domStar) return dowMatch;
  if (dowStar) return domMatch;
  return domMatch || dowMatch;
}

/**
 * Test whether a cron should fire at any minute within a window
 * starting at `windowStart` with the given length. Used by the
 * scheduler tick which runs every 5 minutes — a cron that would
 * have fired at 09:03 should still trigger when the tick happens
 * at 09:05.
 */
export function cronMatchesWithinWindow(
  expression: string,
  windowStart: Date,
  windowLengthMinutes = 5,
): boolean {
  for (let i = 0; i < windowLengthMinutes; i++) {
    const probe = new Date(windowStart.getTime() + i * 60_000);
    if (cronMatches(expression, probe)) return true;
  }
  return false;
}
