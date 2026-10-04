/**
 * ca-stat-holidays — Canadian statutory holidays + business-day math.
 *
 * DATA SOURCES (researched October 2026; see README.md for full list):
 * - Federal (Canada Labour Code, 10 general holidays + weekend substitution rule):
 *   https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/vacations-holidays.html
 * - Ontario (ESA, 9 public holidays):
 *   http://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays
 * - Consolidated per-province/territory matrix (each section cites the provincial
 *   government's employment-standards source):
 *   https://en.wikipedia.org/wiki/Public_holidays_in_Canada
 * - 2027 cross-check of rule-derived dates:
 *   https://www.thecanadianwire.com/news/statutory-holidays-in-canada-2027-the-full-list-and-which-provinces-observe-each
 * - Ontario 2026/2027 date cross-check:
 *   https://www.statutoryholidays.com/ontario.php/
 *
 * COVERAGE: federal + all 13 provinces/territories, years 2026 and 2027.
 * Every jurisdiction/year shipped here was verified against the sources above.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Classification of a calendar entry. */
export type HolidayKind =
  | "statutory" // legislated paid statutory holiday
  | "public-service" // statutory/observed for government/public-service employees
  | "observance" // legislated day of observance with special rules (not ESA statutory)
  | "days-of-rest" // NB Days of Rest Act prescribed day (retail closing, not paid)
  | "optional"; // commonly observed but not legislated (e.g. Thanksgiving in Atlantic Canada)

export type DateRule =
  | { type: "fixed"; month: number; day: number }
  | { type: "nth-weekday"; month: number; weekday: number; n: number } // n=1..5, weekday 0=Sun..6=Sat
  | { type: "monday-before"; month: number; day: number } // Monday strictly before (month, day), e.g. Victoria Day
  | { type: "easter-offset"; offset: number } // -2 = Good Friday, +1 = Easter Monday
  | { type: "closest-monday"; month: number; day: number } // Monday nearest to (month, day), e.g. NL Discovery Day
  | { type: "friday-before-last-sunday-feb" }; // YT Heritage Day

export interface HolidayDef {
  name: string;
  kind: HolidayKind;
  /** True when most employees in the jurisdiction get the day off (paid). */
  dayOff: boolean;
  rule: DateRule;
  note?: string;
}

export interface HolidayInstance {
  name: string;
  kind: HolidayKind;
  dayOff: boolean;
  /** Nominal calendar date (YYYY-MM-DD) the rule produces. */
  date: string;
  /** Actual day-off date after weekend shifting (null when not shifted). */
  observedDate: string | null;
  note?: string;
}

export type JurisdictionCode =
  | "FEDERAL"
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export const JURISDICTIONS: JurisdictionCode[] = [
  "FEDERAL",
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

export const SUPPORTED_YEARS = [2026, 2027] as const;
export type SupportedYear = (typeof SUPPORTED_YEARS)[number];

// ---------------------------------------------------------------------------
// Date math (all UTC to avoid timezone drift)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function parseDateStrict(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date "${s}". Expected format YYYY-MM-DD.`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (
    d.getUTCFullYear() !== +m[1] ||
    d.getUTCMonth() !== +m[2] - 1 ||
    d.getUTCDate() !== +m[3]
  ) {
    throw new Error(`Invalid calendar date "${s}".`);
  }
  return d;
}

export function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function isWeekend(d: Date): boolean {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

/** Easter Sunday via the Anonymous Gregorian algorithm. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** n-th `weekday` (0=Sun..6=Sat) of a month (n=1..5). */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(first, delta + (n - 1) * 7);
}

/** The Monday strictly before the given (month, day) — Victoria Day / Patriots' Day rule. */
export function mondayBefore(year: number, month: number, day: number): Date {
  const ref = new Date(Date.UTC(year, month - 1, day));
  const delta = (ref.getUTCDay() - 1 + 7) % 7; // days back to previous Monday
  return addDays(ref, -(delta === 0 ? 7 : delta));
}

/** Monday closest to (month, day) — NL Discovery Day / Orangemen's Day rule. */
export function closestMonday(year: number, month: number, day: number): Date {
  const ref = new Date(Date.UTC(year, month - 1, day));
  const back = (ref.getUTCDay() - 1 + 7) % 7; // days back to Monday
  const fwd = (8 - ref.getUTCDay()) % 7; // days forward to Monday
  return addDays(ref, back <= fwd ? -back : fwd);
}

/** Friday before the last Sunday in February — Yukon Heritage Day rule. */
export function fridayBeforeLastSundayFeb(year: number): Date {
  const lastDay = new Date(Date.UTC(year, 2, 0)); // Feb 28/29
  const backToSunday = lastDay.getUTCDay(); // days back to Sunday
  const lastSunday = addDays(lastDay, -backToSunday);
  return addDays(lastSunday, -2); // Friday before it
}

export function resolveRule(rule: DateRule, year: number): Date {
  switch (rule.type) {
    case "fixed":
      return new Date(Date.UTC(year, rule.month - 1, rule.day));
    case "nth-weekday":
      return nthWeekday(year, rule.month, rule.weekday, rule.n);
    case "monday-before":
      return mondayBefore(year, rule.month, rule.day);
    case "easter-offset":
      return addDays(easterSunday(year), rule.offset);
    case "closest-monday":
      return closestMonday(year, rule.month, rule.day);
    case "friday-before-last-sunday-feb":
      return fridayBeforeLastSundayFeb(year);
  }
}

// ---------------------------------------------------------------------------
// Holiday tables
// Sources per table are in the header comment + README.md.
// ---------------------------------------------------------------------------

const MON = 1;
const FRI = 5;

/** The five nationwide statutory holidays (all 13 provinces/territories). */
function nationwide(): HolidayDef[] {
  return [
    { name: "New Year's Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 1, day: 1 } },
    { name: "Good Friday", kind: "statutory", dayOff: true, rule: { type: "easter-offset", offset: -2 } },
    { name: "Canada Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 7, day: 1 } },
    { name: "Labour Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 9, weekday: MON, n: 1 } },
    { name: "Christmas Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 25 } },
  ];
}

const TABLES: Record<JurisdictionCode, HolidayDef[]> = {
  FEDERAL: [
    ...nationwide(),
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Boxing Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 26 } },
    {
      name: "Easter Monday",
      kind: "public-service",
      dayOff: true,
      rule: { type: "easter-offset", offset: 1 },
      note: "Observed by the federal public service and banks; not a general holiday under the Canada Labour Code for private federally regulated employers.",
    },
  ],
  AB: [
    ...nationwide(),
    { name: "Family Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Easter Monday", kind: "optional", dayOff: false, rule: { type: "easter-offset", offset: 1 }, note: "Optional general holiday in Alberta." },
    { name: "Heritage Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 }, note: "Optional general holiday in Alberta (first Monday in August)." },
    { name: "Alberta Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 9, day: 1 }, note: "Optional general holiday in Alberta." },
    { name: "National Day for Truth and Reconciliation", kind: "optional", dayOff: false, rule: { type: "fixed", month: 9, day: 30 }, note: "Optional general holiday in Alberta; not a paid statutory holiday." },
    { name: "Boxing Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 12, day: 26 }, note: "Optional general holiday in Alberta." },
  ],
  BC: [
    ...nationwide(),
    { name: "Family Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "British Columbia Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
  ],
  MB: [
    ...nationwide(),
    { name: "Louis Riel Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Terry Fox Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 }, note: "Optional (civic) holiday in Manitoba; not statutory." },
    {
      name: "Remembrance Day",
      kind: "observance",
      dayOff: false,
      rule: { type: "fixed", month: 11, day: 11 },
      note: "An official day of observance in Manitoba, not a statutory holiday.",
    },
  ],
  NB: [
    ...nationwide(),
    { name: "Family Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "New Brunswick Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Victoria Day", kind: "days-of-rest", dayOff: false, rule: { type: "monday-before", month: 5, day: 25 }, note: "Prescribed public holiday under the NB Days of Rest Act (retail closing); not a paid statutory holiday." },
    { name: "Thanksgiving Day", kind: "days-of-rest", dayOff: false, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 }, note: "Prescribed public holiday under the NB Days of Rest Act (retail closing); not a paid statutory holiday." },
    { name: "Boxing Day", kind: "days-of-rest", dayOff: false, rule: { type: "fixed", month: 12, day: 26 }, note: "Prescribed public holiday under the NB Days of Rest Act (retail closing); not a paid statutory holiday." },
  ],
  NL: [
    { name: "New Year's Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 1, day: 1 } },
    { name: "Good Friday", kind: "statutory", dayOff: true, rule: { type: "easter-offset", offset: -2 } },
    {
      name: "Memorial Day",
      kind: "statutory",
      dayOff: true,
      rule: { type: "fixed", month: 7, day: 1 },
      note: "Newfoundland and Labrador observes Memorial Day on July 1 instead of Canada Day.",
    },
    { name: "Labour Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 9, weekday: MON, n: 1 } },
    { name: "Armistice Day (Remembrance Day)", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Christmas Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 25 } },
    { name: "St. Patrick's Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 3, day: 17 }, note: "Paid holiday for NL provincial government employees; not statutory for private-sector workers." },
    { name: "St. George's Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 4, day: 23 }, note: "Paid holiday for NL provincial government employees; not statutory for private-sector workers." },
    { name: "Victoria Day", kind: "optional", dayOff: false, rule: { type: "monday-before", month: 5, day: 25 }, note: "Paid holiday for NL provincial government employees; not statutory for private-sector workers." },
    {
      name: "Discovery Day",
      kind: "optional",
      dayOff: false,
      rule: { type: "closest-monday", month: 6, day: 24 },
      note: "Temporarily called the June Holiday since 2020; Monday closest to June 24; paid holiday for NL provincial government employees.",
    },
    { name: "Orangemen's Day", kind: "optional", dayOff: false, rule: { type: "closest-monday", month: 7, day: 12 }, note: "Monday closest to July 12; paid holiday for NL provincial government employees." },
    { name: "National Day for Truth and Reconciliation", kind: "optional", dayOff: false, rule: { type: "fixed", month: 9, day: 30 }, note: "Schools and some public services close; not a paid statutory holiday in NL." },
    { name: "Thanksgiving Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 }, note: "Paid holiday for NL provincial government employees; not statutory for private-sector workers." },
    { name: "Boxing Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 12, day: 26 }, note: "Paid holiday for NL provincial government employees; not statutory for private-sector workers." },
  ],
  NS: [
    ...nationwide(),
    { name: "Heritage Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    {
      name: "Remembrance Day",
      kind: "observance",
      dayOff: true,
      rule: { type: "fixed", month: 11, day: 11 },
      note: "Governed separately by the NS Remembrance Day Act: retail must close; employees get the day off or an alternate day off with pay.",
    },
    { name: "Victoria Day", kind: "optional", dayOff: false, rule: { type: "monday-before", month: 5, day: 25 }, note: "Not a statutory holiday in Nova Scotia." },
    { name: "Natal Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 }, note: "Common day off in Halifax Regional Municipality; not a statutory holiday." },
    { name: "Thanksgiving Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 }, note: "Optional holiday in Nova Scotia; not statutory." },
    { name: "Boxing Day", kind: "optional", dayOff: false, rule: { type: "fixed", month: 12, day: 26 }, note: "Not a statutory holiday in Nova Scotia, though most retail closes." },
  ],
  NT: [
    ...nationwide(),
    { name: "Easter Monday", kind: "statutory", dayOff: true, rule: { type: "easter-offset", offset: 1 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "National Indigenous Peoples Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 6, day: 21 } },
    { name: "Civic Holiday", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Boxing Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 26 } },
  ],
  NU: [
    ...nationwide(),
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Nunavut Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 7, day: 9 } },
    { name: "Civic Holiday", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
  ],
  ON: [
    ...nationwide(),
    { name: "Family Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Boxing Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 26 } },
    {
      name: "Civic Holiday",
      kind: "optional",
      dayOff: false,
      rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 },
      note: "Not a statutory holiday in Ontario; widely observed by municipalities and banks (Simcoe Day, Colonel By Day, etc.).",
    },
  ],
  PE: [
    ...nationwide(),
    { name: "Islander Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "Thanksgiving Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 }, note: "Optional holiday in Prince Edward Island; not statutory." },
    { name: "Gold Cup Parade Day", kind: "optional", dayOff: false, rule: { type: "nth-weekday", month: 8, weekday: FRI, n: 3 }, note: "Observed in the Charlottetown area (third Friday in August); not a statutory holiday." },
  ],
  QC: [
    { name: "New Year's Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 1, day: 1 } },
    {
      name: "Good Friday",
      kind: "statutory",
      dayOff: true,
      rule: { type: "easter-offset", offset: -2 },
      note: "In Quebec, employers must grant either Good Friday or Easter Monday as the statutory Easter holiday (most grant both).",
    },
    {
      name: "Easter Monday",
      kind: "statutory",
      dayOff: true,
      rule: { type: "easter-offset", offset: 1 },
      note: "In Quebec, employers must grant either Good Friday or Easter Monday as the statutory Easter holiday (most grant both).",
    },
    { name: "National Patriots' Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Saint-Jean-Baptiste Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 6, day: 24 } },
    { name: "Canada Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 7, day: 1 }, note: "If July 1 falls on a Sunday, observed July 2." },
    { name: "Labour Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 9, weekday: MON, n: 1 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Christmas Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 12, day: 25 } },
  ],
  SK: [
    ...nationwide(),
    { name: "Family Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 2, weekday: MON, n: 3 } },
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "Saskatchewan Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 1 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
  ],
  YT: [
    ...nationwide(),
    { name: "Victoria Day", kind: "statutory", dayOff: true, rule: { type: "monday-before", month: 5, day: 25 } },
    { name: "National Indigenous Peoples Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 6, day: 21 } },
    { name: "Discovery Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 8, weekday: MON, n: 3 } },
    { name: "Thanksgiving Day", kind: "statutory", dayOff: true, rule: { type: "nth-weekday", month: 10, weekday: MON, n: 2 } },
    { name: "Remembrance Day", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 11, day: 11 } },
    { name: "National Day for Truth and Reconciliation", kind: "statutory", dayOff: true, rule: { type: "fixed", month: 9, day: 30 } },
    { name: "Heritage Day", kind: "public-service", dayOff: false, rule: { type: "friday-before-last-sunday-feb" }, note: "Statutory holiday for Yukon public service employees only (Friday before the last Sunday in February)." },
    { name: "Easter Monday", kind: "public-service", dayOff: false, rule: { type: "easter-offset", offset: 1 }, note: "Statutory holiday for Yukon public service employees only." },
    { name: "Boxing Day", kind: "public-service", dayOff: false, rule: { type: "fixed", month: 12, day: 26 }, note: "Statutory holiday for Yukon public service employees only." },
  ],
};

// ---------------------------------------------------------------------------
// Year resolution + weekend observance
// ---------------------------------------------------------------------------

/**
 * Resolve a jurisdiction's full holiday calendar for a year.
 *
 * Weekend observance: holidays with dayOff=true that land on a Saturday or
 * Sunday shift to the next weekday that is not already a holiday/day-off.
 * This matches the federal rule (Canada Labour Code: paid day off on the
 * working day immediately before/after) and the common provincial practice
 * ("in most provinces, when a statutory holiday falls on a normal day off,
 * the following workday is considered a statutory holiday").
 */
const calendarCache = new Map<string, HolidayInstance[]>();

export function getCalendar(jurisdiction: JurisdictionCode, year: number): HolidayInstance[] {
  const key = `${jurisdiction}:${year}`;
  const cached = calendarCache.get(key);
  if (cached) return cached;

  const defs = TABLES[jurisdiction];
  const instances: HolidayInstance[] = defs.map((def) => ({
    name: def.name,
    kind: def.kind,
    dayOff: def.dayOff,
    date: fmt(resolveRule(def.rule, year)),
    observedDate: null,
    note: def.note,
  }));

  // Chronological order so shifted days stack correctly.
  instances.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const taken = new Set<string>();
  for (const h of instances) {
    if (h.dayOff) taken.add(h.date);
  }

  for (const h of instances) {
    if (!h.dayOff) continue;
    const d = parseDateStrict(h.date);
    if (!isWeekend(d)) continue;
    let shifted = addDays(d, 1);
    while (isWeekend(shifted) || taken.has(fmt(shifted))) {
      shifted = addDays(shifted, 1);
    }
    h.observedDate = fmt(shifted);
    taken.add(h.observedDate);
  }

  calendarCache.set(key, instances);
  return instances;
}

/** All dates in a year that are non-business days (weekends excluded — use isWeekend). */
export function getDayOffDates(jurisdiction: JurisdictionCode, year: number): Set<string> {
  const set = new Set<string>();
  for (const h of getCalendar(jurisdiction, year)) {
    if (!h.dayOff) continue;
    if (h.observedDate) {
      // The shifted day is the day off; the nominal weekend date stays a weekend.
      set.add(h.observedDate);
    } else {
      set.add(h.date);
    }
  }
  return set;
}

export function findHoliday(jurisdiction: JurisdictionCode, dateStr: string): HolidayInstance | null {
  const d = parseDateStrict(dateStr);
  const year = d.getUTCFullYear();
  if (!(SUPPORTED_YEARS as readonly number[]).includes(year)) {
    throw new Error(
      `Year ${year} is not supported. Supported years: ${SUPPORTED_YEARS.join(", ")}.`
    );
  }
  for (const h of getCalendar(jurisdiction, year)) {
    if (h.date === dateStr || h.observedDate === dateStr) return h;
  }
  return null;
}

/**
 * Non-throwing variant for date arithmetic that may wander outside the
 * supported year range: dates outside 2026–2027 are treated as having no
 * holiday data (weekends still skipped by the caller).
 */
export function findHolidaySafe(jurisdiction: JurisdictionCode, dateStr: string): HolidayInstance | null {
  try {
    return findHoliday(jurisdiction, dateStr);
  } catch {
    return null;
  }
}

export function isDayOff(jurisdiction: JurisdictionCode, dateStr: string): boolean {
  const d = parseDateStrict(dateStr);
  if (isWeekend(d)) return true;
  const h = findHoliday(jurisdiction, dateStr);
  return h !== null && h.dayOff;
}

export function normalizeJurisdiction(input: string): JurisdictionCode {
  const code = input.trim().toUpperCase();
  if ((JURISDICTIONS as string[]).includes(code)) return code as JurisdictionCode;
  throw new Error(
    `Unknown jurisdiction "${input}". Use "federal" or a 2-letter province/territory code: ${JURISDICTIONS.filter(
      (j) => j !== "FEDERAL"
    ).join(", ")}.`
  );
}
