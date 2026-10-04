# ca-stat-holidays — Canadian Statutory Holidays & Business Days

[![MCPize](https://mcpize.com/badge/@mcpize/mcpize?type=hosted)](https://mcpize.com)

An MCP server that answers Canadian holiday questions with **researched, jurisdiction-accurate
data** — not guesses. Covers the federal jurisdiction plus all 13 provinces and territories for
**2026 and 2027**, including the differences that trip people up (Family Day vs. Louis Riel Day vs.
Islander Day vs. Heritage Day; where Remembrance Day, Boxing Day, and Truth and Reconciliation Day
are — and aren't — statutory).

## What it does

- Tells you whether a specific date is a statutory holiday in a jurisdiction, with weekend
  observance (shifted days off) handled.
- Lists a full year's calendar, flagging each entry as statutory, public-service-only, a special
  observance, a Days-of-Rest day, or optional — so "not statutory" answers still explain what's
  actually observed.
- Adds/subtracts business days and finds the next business day, skipping weekends and that
  jurisdiction's statutory holidays.

## Tools

| Tool | Inputs | Returns |
|------|--------|---------|
| `is_holiday` | `date` (YYYY-MM-DD), `jurisdiction` ("federal" or AB/BC/MB/NB/NL/NS/NT/NU/ON/PE/QC/SK/YT) | `{date, jurisdiction, is_holiday, name, nominal_date, observed_date, note, kind}` |
| `holidays_in_year` | `year` (2026\|2027), `jurisdiction` | `{year, jurisdiction, holidays: [{date, name, kind, day_off, observed, observed_date, note}], count}` |
| `add_business_days` | `date`, `n` (int, may be negative, ±3650), `jurisdiction` | `{start_date, n, result_date, weekends_skipped, holidays_skipped, jurisdiction}` |
| `next_business_day` | `date`, `jurisdiction` | `{date, next_business_day, was_holiday, holiday_name, jurisdiction}` |

`kind` values: `statutory`, `public-service` (government employees only), `observance`
(legislated day of observance with special rules), `days-of-rest` (NB retail-closing days),
`optional` (commonly observed, not legislated). `count` in `holidays_in_year` counts entries that
are actual days off.

## Pricing

- **Free:** 100 queries/day (enforced in code via `FREE_DAILY_LIMIT`, default 100)
- **Pro:** $5/month, unlimited
- **x402:** $0.005 USDC per call on all four tools

## Data sources

Holiday tables in `src/holidays.ts` were compiled in October 2026 from:

1. **Federal — Canada Labour Code, 10 general holidays + weekend substitution rule.**
   https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/vacations-holidays.html
2. **Ontario — ESA, 9 public holidays.**
   http://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays
3. **All provinces/territories — consolidated matrix; each section cites that government's
   employment-standards legislation.**
   https://en.wikipedia.org/wiki/Public_holidays_in_Canada
4. **2027 rule-derived dates cross-check.**
   https://www.thecanadianwire.com/news/statutory-holidays-in-canada-2027-the-full-list-and-which-provinces-observe-each
5. **Ontario 2026/2027 dates cross-check.**
   https://www.statutoryholidays.com/ontario.php/

## Coverage

Every jurisdiction/year shipped was verified against the sources above:

- **Jurisdictions:** `federal`, AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT (all 14).
- **Years:** 2026, 2027. Other years return a clear "not supported" error.

## Limitations & assumptions

- **Weekend observance:** day-off holidays landing on Saturday/Sunday shift to the next free
  weekday. This is the explicit federal rule (Canada Labour Code) and the documented common
  provincial practice. Jurisdiction-specific quirks are noted per entry (e.g. Quebec's explicit
  "Canada Day on Sunday → observed July 2").
- **National Day for Truth and Reconciliation (Sep 30)** is statutory for federal, BC, PE, NT,
  NU, YT. In MB/NB/NS/NL schools and some public services close but it is **not** a paid
  statutory holiday; it is not observed in AB/SK/ON/QC. Encoded accordingly.
- **Remembrance Day (Nov 11)** is statutory in federal, AB, BC, NB, NL, NT, NU, PE, SK, YT —
  **not** in ON, QC, MB. In NS it is governed by a separate Remembrance Day Act (retail closed;
  day off or alternate) and is returned as a holiday with `kind: "observance"`.
- **Boxing Day (Dec 26)** is statutory in federal, ON, NT; a Days-of-Rest (retail closing) day in
  NB; optional elsewhere.
- **Easter Monday** is a federal public-service/bank observance (not a Canada Labour Code general
  holiday), statutory in NT, and in QC it is the employer's statutory Easter choice alongside Good
  Friday (most QC employers grant both).
- **NL Discovery Day** uses the official "Monday closest to June 24" rule (Jun 22 in 2026,
  Jun 21 in 2027), not a fixed June 23.
- **NL's July 1** is encoded as Memorial Day (Canada Day is not the NL statutory holiday).
- Optional/government-only entries (e.g. NL St. Patrick's Day, YT Heritage Day, PE Gold Cup Parade
  Day, ON Civic Holiday) are included with `day_off: false` and explanatory notes.
- This is general reference data, not legal or payroll advice. Employment-standards rules change;
  verify against the official sources above for compliance decisions.

## Development

```bash
npm install
npm run dev      # hot reload on :8080
npm test         # vitest unit tests (53 tests)
npm run build    # tsc -> dist/
bash test-mcp.sh # MCP protocol smoke test (server must be running)
```

## Deployment

```bash
mcpize deploy
mcpize publish
```

No secrets required (keyless server). Freemium quota is enforced in code; set `FREE_DAILY_LIMIT`
to change the free tier (default 100/day).

## License

MIT
