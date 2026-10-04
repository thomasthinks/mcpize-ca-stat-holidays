/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Throw friendly Errors on invalid input; index.ts converts them to isError results.
 */

import {
  SUPPORTED_YEARS,
  SupportedYear,
  fmt,
  parseDateStrict,
  addDays,
  isWeekend,
  getCalendar,
  findHoliday,
  findHolidaySafe,
  normalizeJurisdiction,
  JurisdictionCode,
  HolidayInstance,
} from "./holidays.js";

// ---------------------------------------------------------------------------
// is_holiday
// ---------------------------------------------------------------------------

export interface IsHolidayResult {
  [key: string]: unknown;
  date: string;
  jurisdiction: string;
  is_holiday: boolean;
  name: string | null;
  /** Nominal date of the holiday (differs from `date` when this is an observed/shifted day). */
  nominal_date: string | null;
  /** The day-off date when the holiday was shifted from a weekend; null when not shifted. */
  observed_date: string | null;
  note: string | null;
  kind: string | null;
}

export function isHoliday(date: string, jurisdiction: string): IsHolidayResult {
  const juris = normalizeJurisdiction(jurisdiction);
  const h: HolidayInstance | null = findHoliday(juris, date);
  const d = parseDateStrict(date);
  const year = d.getUTCFullYear();

  if (!h || !h.dayOff) {
    // Surface nearby context: an optional/observance entry on this date, if any.
    const note =
      h && !h.dayOff
        ? `${h.name} is ${describeKind(h)} in ${jurisLabel(juris)} (${year}); it is not a statutory day off.`
        : `No statutory holiday on ${date} in ${jurisLabel(juris)}.`;
    return {
      date,
      jurisdiction: jurisLabel(juris),
      is_holiday: false,
      name: null,
      nominal_date: null,
      observed_date: null,
      note,
      kind: h ? h.kind : null,
    };
  }

  return {
    date,
    jurisdiction: jurisLabel(juris),
    is_holiday: true,
    name: h.name,
    nominal_date: h.date,
    observed_date: h.observedDate,
    note:
      h.observedDate && h.observedDate !== date
        ? `${h.name} fell on a weekend in ${year} and is observed on ${h.observedDate}.`
        : h.note ?? null,
    kind: h.kind,
  };
}

function describeKind(h: HolidayInstance): string {
  switch (h.kind) {
    case "optional":
      return "an optional (non-statutory) holiday";
    case "days-of-rest":
      return "a Days of Rest Act day (retail closing, not a paid statutory holiday)";
    case "public-service":
      return "a public-service-only holiday";
    case "observance":
      return "a day of observance, not a statutory holiday";
    default:
      return "not a statutory day off";
  }
}

// ---------------------------------------------------------------------------
// holidays_in_year
// ---------------------------------------------------------------------------

export interface YearHolidayEntry {
  [key: string]: unknown;
  date: string;
  name: string;
  kind: string;
  day_off: boolean;
  /** Present only when the holiday was shifted off a weekend. */
  observed: boolean;
  observed_date: string | null;
  note: string | null;
}

export interface HolidaysInYearResult {
  [key: string]: unknown;
  year: number;
  jurisdiction: string;
  holidays: YearHolidayEntry[];
  /** Number of entries that are actual days off (statutory + public-service + legislated observances). */
  count: number;
}

export function holidaysInYear(year: number, jurisdiction: string): HolidaysInYearResult {
  const juris = normalizeJurisdiction(jurisdiction);
  if (!(SUPPORTED_YEARS as readonly number[]).includes(year)) {
    throw new Error(
      `Year ${year} is not supported. Supported years: ${SUPPORTED_YEARS.join(", ")}.`
    );
  }
  const cal = getCalendar(juris, year as SupportedYear);
  const holidays: YearHolidayEntry[] = cal.map((h) => ({
    date: h.observedDate ?? h.date,
    name: h.name,
    kind: h.kind,
    day_off: h.dayOff,
    observed: h.observedDate !== null,
    observed_date: h.observedDate,
    note: h.note ?? null,
  }));
  return {
    year,
    jurisdiction: jurisLabel(juris),
    holidays,
    count: holidays.filter((h) => h.day_off).length,
  };
}

// ---------------------------------------------------------------------------
// add_business_days
// ---------------------------------------------------------------------------

export interface AddBusinessDaysResult {
  [key: string]: unknown;
  start_date: string;
  n: number;
  result_date: string;
  weekends_skipped: number;
  holidays_skipped: number;
  jurisdiction: string;
}

export function addBusinessDays(
  date: string,
  n: number,
  jurisdiction: string
): AddBusinessDaysResult {
  const juris = normalizeJurisdiction(jurisdiction);
  if (!Number.isInteger(n)) {
    throw new Error(`n must be an integer, got ${n}.`);
  }
  if (Math.abs(n) > 3650) {
    throw new Error("n must be between -3650 and 3650.");
  }
  let current = parseDateStrict(date);
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let weekendsSkipped = 0;
  let holidaysSkipped = 0;

  while (remaining > 0) {
    current = addDays(current, step);
    const s = fmt(current);
    if (isWeekend(current)) {
      weekendsSkipped++;
      continue;
    }
    const h = findHolidaySafe(juris, s);
    if (h && h.dayOff) {
      holidaysSkipped++;
      continue;
    }
    remaining--;
  }

  return {
    start_date: date,
    n,
    result_date: fmt(current),
    weekends_skipped: weekendsSkipped,
    holidays_skipped: holidaysSkipped,
    jurisdiction: jurisLabel(juris),
  };
}

// ---------------------------------------------------------------------------
// next_business_day
// ---------------------------------------------------------------------------

export interface NextBusinessDayResult {
  [key: string]: unknown;
  date: string;
  next_business_day: string;
  was_holiday: boolean;
  holiday_name: string | null;
  jurisdiction: string;
}

export function nextBusinessDay(date: string, jurisdiction: string): NextBusinessDayResult {
  const juris = normalizeJurisdiction(jurisdiction);
  let current = parseDateStrict(date);
  const h = findHoliday(juris, date);
  const wasHoliday = !!h && h.dayOff;

  // Move forward at least one day, then skip non-business days.
  do {
    current = addDays(current, 1);
  } while (isWeekend(current) || isDayOffOn(juris, fmt(current)));

  return {
    date,
    next_business_day: fmt(current),
    was_holiday: wasHoliday,
    holiday_name: wasHoliday ? h!.name : null,
    jurisdiction: jurisLabel(juris),
  };
}

function isDayOffOn(juris: JurisdictionCode, dateStr: string): boolean {
  const h = findHolidaySafe(juris, dateStr);
  return !!h && h.dayOff;
}

function jurisLabel(j: JurisdictionCode): string {
  return j === "FEDERAL" ? "federal" : j;
}
