/** Wall-clock time belongs to the user's chosen local calendar date. */
export const localTime = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export const validTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const compareDatedRecordsNewestFirst = (
  a: { id: string; date: string; time?: string },
  b: { id: string; date: string; time?: string },
) =>
  b.date.localeCompare(a.date) ||
  (b.time ?? "").localeCompare(a.time ?? "") ||
  b.id.localeCompare(a.id);
