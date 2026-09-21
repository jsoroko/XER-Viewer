const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateLongFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("en-US");

export const fmtDate = (t: number | null) => (t === null ? "" : dateFmt.format(t).replace(/ /g, "-"));
export const fmtDateLong = (t: number | null) => (t === null ? "—" : dateLongFmt.format(t));
export const fmtDateTime = (t: number | null) => (t === null ? "—" : dateTimeFmt.format(t));
export const fmtNumber = (n: number | null) => (n === null ? "—" : numberFmt.format(n));
export const fmtInt = (n: number) => intFmt.format(n);

/** Hours → working days using the activity's calendar. */
export const hoursToDays = (hrs: number | null, dayHrs: number) => (hrs === null ? null : hrs / (dayHrs || 8));

export function fmtDays(hrs: number | null, dayHrs: number): string {
  const d = hoursToDays(hrs, dayHrs);
  return d === null ? "" : `${numberFmt.format(d)}d`;
}

export function fmtMoney(n: number | null, currency = ""): string {
  if (n === null) return "—";
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
  return currency ? `${currency} ${s}` : s;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
