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

- `banksClosed` is what payment and settlement timing should use. Holidays for
  some people only (women only, a community, a province) are listed with
  `appliesTo` and usually `banksClosed: false`.
- `weekend` is the weekly closure; it is not repeated in `holidays`.
- Dates are Gregorian (`YYYY-MM-DD`).

Fetch it at build time, or keep a bundled copy to fall back on: a holiday
calendar should not depend on this site being up. Fields may be added, never
renamed or removed.

## Updating it

1. Edit `data/<year>.csv` (see `data/TEMPLATE.csv.example`). One row per day;
   list every day of a multi-day festival.

   | Column | Required | |
   | --- | --- | --- |
   | `date` | yes | Gregorian, `YYYY-MM-DD` |
   | `name` | yes | English name |
   | `name_ne` | no | Nepali name |
   | `banks_closed` | yes | `yes` or `no` |
   | `applies_to` | no | e.g. `women only`, `Koshi Province`, `Kathmandu Valley` |
   | `note` | no | e.g. `election`, `tentative` |

2. Set the source notice and weekend in `data/meta.json`.
3. Check locally: `node scripts/build.mjs --check`.
4. Open a pull request. The check runs on every pull request; merging to
   `main` publishes.
