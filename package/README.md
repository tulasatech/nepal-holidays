# nepal-date-holidays

Nepal's public and bank holidays, with an API in the shape of
[date-fns-holiday-us](https://www.npmjs.com/package/date-fns-holiday-us).

Nepal's holidays follow the Bikram Sambat and lunar calendars and are set each
year by the government, so they can't be calculated. This package carries the
published list from [tulasatech/nepal-holidays](https://github.com/tulasatech/nepal-holidays),
and a new version is released whenever the list changes.

```js
import { getBankHolidays, isBankHoliday, isBankingDay, addBankingDays, getHoliday } from "nepal-date-holidays";

isBankHoliday(new Date(2026, 9, 21));      // true (Dashain)
getHoliday(new Date(2026, 9, 21))?.name;   // "Dashain Holiday"
addBankingDays(new Date(2026, 9, 16), 1);  // skips the weekend and Dashain
getBankHolidays(2026);                     // [{ date, isoDate, name, bankHoliday, nationwide, appliesTo? }, …]
```

| Function | |
| --- | --- |
| `getHolidays(year)` | Every listed holiday, including those for some people or areas only |
| `getBankHolidays(year)` | Holidays on which banks are closed |
| `getHoliday(date)` | The holiday on that day, or `undefined` |
| `isHoliday(date)`, `isBankHoliday(date)` | |
| `isWeekend(date)` | Saturday or Sunday (the `weekend` export) |
| `isBankingDay(date)` | Not the weekend and not a bank holiday |
| `addBankingDays(date, n)`, `nextBankingDay(date)` | Skips weekends and bank holidays; `n` may be negative |
| `isCovered(date)`, `getCoveredYears()` | Whether the data covers that year |

- A `Date` is read as the calendar day it falls on in the local time zone, as
  date-fns does, and returned dates are at local midnight. For Nepal time
  anywhere, build the `Date` from the Nepal calendar date.
- Outside the covered years nothing is known: check `isCovered` before
  treating a day as a working day.
- `appliesTo` is set for holidays that are not nationwide (some employees, or
  an area such as Kathmandu Valley); `nationwide` is then `false`.

Found a missing holiday or a working day listed as one?
[Report it](https://tulasatech.github.io/nepal-holidays/).
