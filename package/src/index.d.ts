export interface NepalHoliday {
  /** Local midnight of the holiday. */
  date: Date;
  /** The same day as YYYY-MM-DD. */
  isoDate: string;
  name: string;
  nameNe?: string;
  /** Banks are closed and payments do not settle. */
  bankHoliday: boolean;
  /** False when the holiday is only for some people or an area. */
  nationwide: boolean;
  /** Who or where it applies to, e.g. "Female employees", "Kathmandu Valley". */
  appliesTo?: string;
}

export type Weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

/** The weekdays banks close every week. */
export declare const weekend: readonly Weekday[];
/** The notice the dates come from. */
export declare const source: string | null;
/** When the data was last updated (ISO timestamp). */
export declare const updated: string;

export declare function getCoveredYears(): number[];
export declare function isCovered(date: Date): boolean;
export declare function getHolidays(year: number): NepalHoliday[];
export declare function getBankHolidays(year: number): NepalHoliday[];
export declare function getHoliday(date: Date): NepalHoliday | undefined;
export declare function isHoliday(date: Date): boolean;
export declare function isBankHoliday(date: Date): boolean;
export declare function isWeekend(date: Date): boolean;
export declare function isBankingDay(date: Date): boolean;
export declare function addBankingDays(date: Date, amount: number): Date;
export declare function nextBankingDay(date: Date): Date;
