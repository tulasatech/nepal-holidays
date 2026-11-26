# Nepal holidays

Nepal's public and bank holidays as JSON, published at
`https://tulasatech.github.io/nepal-holidays/`.

Nepal's holidays follow the Bikram Sambat and lunar calendars and are set by
the government each year, so they cannot be calculated. This repo holds the
published list, one CSV per Gregorian year.

## Using it

| URL | What |
| --- | --- |
| `/holidays/index.json` | Years available, the weekly weekend, the source, last update |
| `/holidays/2026.json` | Every holiday in 2026 |
| `/holiday-year.schema.json` | JSON Schema for a year file |
| `/` | The list, with a form to report a problem |

```json
{
  "country": "NP",
  "year": 2026,
  "source": "Ministry of Home Affairs notice …",
  "weekend": ["saturday"],
  "holidays": [
    { "date": "2026-04-14", "name": "Nepali New Year", "nameNe": "नयाँ वर्ष", "banksClosed": true }
  ]
}
```

- `banksClosed` means banks are closed. `nrbUrgentServices: true` marks days
  Nepal Rastra Bank still runs RTGS, ECC and urgent services during banking
  hours, so settlement can continue; on closed days without it, it can't.
- Days the government declares later (Eids, Bhoto Jatra and others marked ✓
  in the NRB notice) are added once their dates are announced.
- `banksClosed` is what payment and settlement timing should use. Holidays for
  some people only (women only, a community, a province) are listed with
  `appliesTo` and usually `banksClosed: false`.
- `weekend` is the weekly closure; it is not repeated in `holidays`.
- Dates are Gregorian (`YYYY-MM-DD`).

Fetch it at build time, or keep a bundled copy to fall back on: a holiday
calendar should not depend on this site being up. Fields may be added, never
renamed or removed.

## Reporting a problem

If a holiday is missing, or a listed day is actually a working day, report it
from the site (each listed day has a "Report as a working day" link), which
opens a pre-filled GitHub issue (a GitHub account is needed), or directly with
the [report form](https://github.com/tulasatech/nepal-holidays/issues/new?template=holiday-report.yml).
Nothing changes until an admin approves the report.

## Approving reports (admins)

Needs git and the GitHub CLI (`gh auth login`) with write access, run from the
repo root on an up-to-date `main` with no local changes.

```sh
node scripts/holidays.mjs list                  # open reports, and what approving each would do
node scripts/holidays.mjs show 12               # one report in full
node scripts/holidays.mjs approve 12 15         # apply these, commit, push, close the issues
node scripts/holidays.mjs approve --all         # every open report that passes the checks
node scripts/holidays.mjs approve 12 --replace  # overwrite the day already listed
node scripts/holidays.mjs approve 12 --no-push  # commit only, push yourself
node scripts/holidays.mjs reject 13 --reason "Not in the notice"
```

A missing-holiday report adds the day to `data/<year>.csv`; a working-day
report removes it. Approval runs the same checks as the build and refuses
anything that fails them: an invalid date, a missing source, a holiday already
listed (unless `--replace`), a working day that isn't listed, or two reports
about the same day in one batch (approve one on its own). Check each report's
source before approving; the checks can't tell whether a holiday is real.

## Editing the data directly

1. Edit `data/<year>.csv` (see `data/TEMPLATE.csv.example`). One row per day;
   list every day of a multi-day festival.

   | Column | Required | |
   | --- | --- | --- |
   | `date` | yes | Gregorian, `YYYY-MM-DD` |
   | `name` | yes | English name |
   | `name_ne` | no | Nepali name |
   | `banks_closed` | yes | `yes` or `no` |
   | `nrb_urgent_services` | no | `yes` when Nepal Rastra Bank still runs cash payment, ECC, RTGS and urgent services (❄ in its notice) |
   | `applies_to` | no | e.g. `women only`, `Koshi Province`, `Kathmandu Valley` |
   | `source` | no | Link to the notice |
   | `note` | no | e.g. `election`, `tentative` |

2. Set the source notice and weekend in `data/meta.json`.
3. Check locally: `node scripts/build.mjs --check`.
4. Open a pull request. The check runs on every pull request; merging to
   `main` publishes.
