import { describe, it, expect } from "vitest";
import { isHoliday, holidaysInYear, addBusinessDays, nextBusinessDay } from "../src/tools.js";
import { easterSunday, fmt, normalizeJurisdiction } from "../src/holidays.js";

// ---------------------------------------------------------------------------
// Brief's required known-date assertions
// ---------------------------------------------------------------------------

describe("required known-date assertions (2026)", () => {
  it('is_holiday("2026-07-01","ON") is Canada Day', () => {
    const r = isHoliday("2026-07-01", "ON");
    expect(r.is_holiday).toBe(true);
    expect(r.name).toBe("Canada Day");
  });

  it('is_holiday("2026-02-16","ON") is Family Day', () => {
    const r = isHoliday("2026-02-16", "ON");
    expect(r.is_holiday).toBe(true);
    expect(r.name).toBe("Family Day");
  });

  it('is_holiday("2026-02-16","QC") is false (no Feb holiday in Quebec)', () => {
    const r = isHoliday("2026-02-16", "QC");
    expect(r.is_holiday).toBe(false);
  });

  it('is_holiday("2026-06-24","QC") is Saint-Jean-Baptiste Day', () => {
    const r = isHoliday("2026-06-24", "QC");
    expect(r.is_holiday).toBe(true);
    expect(r.name).toBe("Saint-Jean-Baptiste Day");
  });

  it('add_business_days("2026-07-03","ON",1) = "2026-07-06"', () => {
    const r = addBusinessDays("2026-07-03", 1, "ON");
    expect(r.result_date).toBe("2026-07-06");
    expect(r.weekends_skipped).toBe(2);
    expect(r.holidays_skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-jurisdiction spot checks (at least one known holiday each, 2026)
// ---------------------------------------------------------------------------

describe("per-jurisdiction spot checks", () => {
  const cases: Array<[string, string, string]> = [
    ["2026-11-11", "federal", "Remembrance Day"],
    ["2026-02-16", "AB", "Family Day"],
    ["2026-08-03", "BC", "British Columbia Day"],
    ["2026-02-16", "MB", "Louis Riel Day"],
    ["2026-08-03", "NB", "New Brunswick Day"],
    ["2026-07-01", "NL", "Memorial Day"],
    ["2026-02-16", "NS", "Heritage Day"],
    ["2026-06-22", "NT", "National Indigenous Peoples Day"], // Jun 21 is Sunday -> observed Jun 22
    ["2026-07-09", "NU", "Nunavut Day"],
    ["2026-12-26", "ON", "Boxing Day"],
    ["2026-02-16", "PE", "Islander Day"],
    ["2026-05-18", "QC", "National Patriots' Day"],
    ["2026-08-03", "SK", "Saskatchewan Day"],
    ["2026-08-17", "YT", "Discovery Day"],
  ];
  for (const [date, juris, name] of cases) {
    it(`${juris} ${date} = ${name}`, () => {
      const r = isHoliday(date, juris);
      expect(r.is_holiday).toBe(true);
      expect(r.name).toBe(name);
    });
  }
});

describe("known non-holidays / jurisdiction differences", () => {
  it("Remembrance Day is not statutory in ON, QC, MB", () => {
    for (const j of ["ON", "QC", "MB"]) {
      expect(isHoliday("2026-11-11", j).is_holiday).toBe(false);
    }
  });

  it("Remembrance Day is statutory in AB, BC, SK", () => {
    for (const j of ["AB", "BC", "SK"]) {
      const r = isHoliday("2026-11-11", j);
      expect(r.is_holiday).toBe(true);
    }
  });

  it("Truth and Reconciliation: statutory BC/YT/NT/NU/PE, not ON/QC/AB/SK", () => {
    for (const j of ["BC", "YT", "NT", "NU", "PE", "federal"]) {
      expect(isHoliday("2026-09-30", j).is_holiday).toBe(true);
    }
    for (const j of ["ON", "QC", "AB", "SK"]) {
      expect(isHoliday("2026-09-30", j).is_holiday).toBe(false);
    }
  });

  it("Thanksgiving is optional (not statutory) in NS, NB, PE, NL", () => {
    for (const j of ["NS", "NB", "PE", "NL"]) {
      const r = isHoliday("2026-10-12", j);
      expect(r.is_holiday).toBe(false);
      expect(r.kind).not.toBe("statutory");
    }
    expect(isHoliday("2026-10-12", "ON").is_holiday).toBe(true);
  });

  it("Civic Holiday is not statutory in ON", () => {
    const r = isHoliday("2026-08-03", "ON");
    expect(r.is_holiday).toBe(false);
    expect(r.kind).toBe("optional");
  });

  it("NL observes Memorial Day on Jul 1 instead of Canada Day", () => {
    const r = isHoliday("2026-07-01", "NL");
    expect(r.is_holiday).toBe(true);
    expect(r.name).toBe("Memorial Day");
  });

  it("Boxing Day is not statutory in NU or QC", () => {
    expect(isHoliday("2026-12-26", "NU").is_holiday).toBe(false);
    expect(isHoliday("2026-12-26", "QC").is_holiday).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weekend observance
// ---------------------------------------------------------------------------

describe("weekend observance", () => {
  it("Boxing Day 2026 (Sat) observed Mon Dec 28 in ON", () => {
    const nominal = isHoliday("2026-12-26", "ON");
    expect(nominal.is_holiday).toBe(true);
    expect(nominal.observed_date).toBe("2026-12-28");

    const observed = isHoliday("2026-12-28", "ON");
    expect(observed.is_holiday).toBe(true);
    expect(observed.name).toBe("Boxing Day");
    expect(observed.nominal_date).toBe("2026-12-26");
  });

  it("Christmas 2027 (Sat) observed Mon Dec 27; Boxing Day 2027 (Sun) observed Tue Dec 28 in ON", () => {
    expect(isHoliday("2027-12-27", "ON").name).toBe("Christmas Day");
    const boxing = isHoliday("2027-12-28", "ON");
    expect(boxing.is_holiday).toBe(true);
    expect(boxing.name).toBe("Boxing Day");
    expect(boxing.nominal_date).toBe("2027-12-26");
  });

  it("National Indigenous Peoples Day 2026 (Sun) observed Mon Jun 22 in YT", () => {
    const r = isHoliday("2026-06-22", "YT");
    expect(r.is_holiday).toBe(true);
    expect(r.name).toBe("National Indigenous Peoples Day");
  });
});

// ---------------------------------------------------------------------------
// holidays_in_year
// ---------------------------------------------------------------------------

describe("holidays_in_year", () => {
  it("ON 2026 has 9 statutory days off", () => {
    const r = holidaysInYear(2026, "ON");
    expect(r.count).toBe(9);
    expect(r.holidays).toHaveLength(10); // 9 statutory + Civic Holiday (optional)
  });

  it("QC 2026 includes Good Friday AND Easter Monday (either/or rule)", () => {
    const r = holidaysInYear(2026, "QC");
    const names = r.holidays.filter((h) => h.day_off).map((h) => h.name);
    expect(names).toContain("Good Friday");
    expect(names).toContain("Easter Monday");
    expect(names).toContain("Saint-Jean-Baptiste Day");
  });

  it("NT 2026 has 13 days off (Easter Monday statutory)", () => {
    const r = holidaysInYear(2026, "NT");
    expect(r.count).toBe(13);
  });

  it("federal 2026 includes Easter Monday as public-service", () => {
    const r = holidaysInYear(2026, "federal");
    const em = r.holidays.find((h) => h.name === "Easter Monday");
    expect(em).toBeDefined();
    expect(em!.kind).toBe("public-service");
    expect(em!.day_off).toBe(true);
  });

  it("rejects unsupported years", () => {
    expect(() => holidaysInYear(2025, "ON")).toThrow(/not supported/);
    expect(() => holidaysInYear(2030, "ON")).toThrow(/not supported/);
  });

  it("entries are chronological", () => {
    const r = holidaysInYear(2027, "BC");
    const dates = r.holidays.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

// ---------------------------------------------------------------------------
// add_business_days
// ---------------------------------------------------------------------------

describe("add_business_days", () => {
  it("negative n subtracts: 2026-07-06 minus 1 = 2026-07-03 (ON)", () => {
    const r = addBusinessDays("2026-07-06", -1, "ON");
    expect(r.result_date).toBe("2026-07-03");
  });

  it("skips Christmas + Boxing Day (observed) 2026 in ON", () => {
    // Thu Dec 24 + 1 business day -> Fri 25 (holiday), Sat, Sun, Mon 28 (Boxing observed) -> Tue 29
    const r = addBusinessDays("2026-12-24", 1, "ON");
    expect(r.result_date).toBe("2026-12-29");
    expect(r.holidays_skipped).toBe(2);
    expect(r.weekends_skipped).toBe(2);
  });

  it("n=0 returns the start date", () => {
    const r = addBusinessDays("2026-07-03", 0, "ON");
    expect(r.result_date).toBe("2026-07-03");
  });

  it("jurisdiction differences matter: Remembrance Day skipped in AB, not ON", () => {
    // Tue Nov 10 2026 + 1 -> AB skips Wed Nov 11 (holiday) -> Thu Nov 12
    const ab = addBusinessDays("2026-11-10", 1, "AB");
    expect(ab.result_date).toBe("2026-11-12");
    expect(ab.holidays_skipped).toBe(1);
    // ON: Nov 11 is not statutory -> Wed Nov 11
    const on = addBusinessDays("2026-11-10", 1, "ON");
    expect(on.result_date).toBe("2026-11-11");
    expect(on.holidays_skipped).toBe(0);
  });

  it("rejects out-of-range n", () => {
    expect(() => addBusinessDays("2026-07-03", 4000, "ON")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// next_business_day
// ---------------------------------------------------------------------------

describe("next_business_day", () => {
  it("after Christmas 2026 (ON) the next business day is Tue Dec 29", () => {
    const r = nextBusinessDay("2026-12-25", "ON");
    expect(r.next_business_day).toBe("2026-12-29");
    expect(r.was_holiday).toBe(true);
    expect(r.holiday_name).toBe("Christmas Day");
  });

  it("after a Friday returns the following Monday", () => {
    const r = nextBusinessDay("2026-07-03", "ON");
    expect(r.next_business_day).toBe("2026-07-06");
    expect(r.was_holiday).toBe(false);
    expect(r.holiday_name).toBeNull();
  });

  it("skips a mid-week holiday: day before Canada Day 2026 (ON)", () => {
    const r = nextBusinessDay("2026-06-30", "ON");
    expect(r.next_business_day).toBe("2026-07-02");
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  it("rejects unknown jurisdiction codes gracefully", () => {
    expect(() => isHoliday("2026-07-01", "XX")).toThrow(/Unknown jurisdiction/);
    expect(() => holidaysInYear(2026, "USA")).toThrow(/Unknown jurisdiction/);
    expect(() => addBusinessDays("2026-07-01", 1, "")).toThrow(/Unknown jurisdiction/);
  });

  it("jurisdiction codes are case-insensitive", () => {
    expect(isHoliday("2026-07-01", "on").is_holiday).toBe(true);
    expect(isHoliday("2026-07-01", "Federal").name).toBe("Canada Day");
  });

  it("rejects malformed dates", () => {
    expect(() => isHoliday("2026-13-01", "ON")).toThrow(/Invalid/);
    expect(() => isHoliday("07/01/2026", "ON")).toThrow(/Invalid date/);
    expect(() => isHoliday("2026-02-30", "ON")).toThrow(/Invalid calendar date/);
  });

  it("rejects years outside 2026-2027 for is_holiday", () => {
    expect(() => isHoliday("2025-07-01", "ON")).toThrow(/not supported/);
  });

  it("normalizeJurisdiction maps federal (any case)", () => {
    expect(normalizeJurisdiction("federal")).toBe("FEDERAL");
    expect(normalizeJurisdiction("qc")).toBe("QC");
  });
});

// ---------------------------------------------------------------------------
// Date-math sanity
// ---------------------------------------------------------------------------

describe("date math sanity", () => {
  it("Easter 2026 = Apr 5 (Good Friday Apr 3, Easter Monday Apr 6)", () => {
    expect(fmt(easterSunday(2026))).toBe("2026-04-05");
  });

  it("Easter 2027 = Mar 28 (Good Friday Mar 26, Easter Monday Mar 29)", () => {
    expect(fmt(easterSunday(2027))).toBe("2027-03-28");
  });

  it("Good Friday resolves correctly in all provinces", () => {
    expect(isHoliday("2026-04-03", "BC").name).toBe("Good Friday");
    expect(isHoliday("2027-03-26", "BC").name).toBe("Good Friday");
  });

  it("YT Heritage Day 2026 = Fri Feb 20 (Friday before last Sunday Feb 22)", () => {
    const r = holidaysInYear(2026, "YT");
    const hd = r.holidays.find((h) => h.name === "Heritage Day");
    expect(hd).toBeDefined();
    expect(hd!.date).toBe("2026-02-20");
    expect(hd!.day_off).toBe(false); // public-service only
  });

  it("NL Discovery Day 2026 = Mon Jun 22 (Monday closest to Jun 24)", () => {
    const r = holidaysInYear(2026, "NL");
    const dd = r.holidays.find((h) => h.name === "Discovery Day");
    expect(dd).toBeDefined();
    expect(dd!.date).toBe("2026-06-22");
  });
});
