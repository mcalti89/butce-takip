import { createHash } from "node:crypto";
import { SaxesParser } from "saxes";
import type { FxQuote } from "../../lib/budget/fx";

export type Bulletin = {
  date: string;
  number: string;
  sourceUrl: string;
  xml: string;
  sha256: string;
  fetchedAt: number;
  rates: FxQuote[];
};
export function istanbulDate(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1996 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function shiftDay(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function initialArchiveDate(today = istanbulDate()) {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}
export function tcmbUrl(date?: string) {
  if (date !== undefined && !validDate(date)) throw new Error("INVALID_DATE");
  return date
    ? `https://www.tcmb.gov.tr/kurlar/${date.slice(0, 4)}${date.slice(5, 7)}/${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(0, 4)}.xml`
    : "https://www.tcmb.gov.tr/kurlar/today.xml";
}
export function parseBulletin(
  xml: string,
  sourceUrl: string,
  now = Date.now(),
  expectedDate?: string,
): Bulletin {
  if (Buffer.byteLength(xml) > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("INVALID_TCMB_XML");
  const parser = new SaxesParser();
  const stack: string[] = [];
  let metadata: Record<string, string> = {};
  let row: Record<string, string> | undefined;
  const rows: Record<string, string>[] = [];
  let text = "";
  parser.on("opentag", (tag) => {
    stack.push(tag.name);
    text = "";
    if (stack.length === 1) {
      if (tag.name !== "Tarih_Date") throw new Error("INVALID_TCMB_ROOT");
      metadata = tag.attributes as Record<string, string>;
    }
    if (stack.length === 2 && tag.name === "Currency")
      row = { code: String(tag.attributes.CurrencyCode || "") };
    if (stack.length > 3) throw new Error("INVALID_TCMB_STRUCTURE");
  });
  parser.on("text", (value) => {
    text += value;
  });
  parser.on("cdata", (value) => {
    text += value;
  });
  parser.on("closetag", () => {
    const name = stack.pop()!;
    if (stack.length === 2 && row) {
      if (Object.hasOwn(row, name)) throw new Error("DUPLICATE_TCMB_FIELD");
      row[name] = text.trim();
    }
    if (name === "Currency" && row) {
      rows.push(row);
      row = undefined;
    }
    text = "";
  });
  parser.write(xml).close();
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(metadata.Tarih || "");
  const date = m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  const number = metadata.Bulten_No || "";
  if (
    !validDate(date) ||
    date > istanbulDate(now) ||
    (expectedDate && date !== expectedDate) ||
    !/^\d{4}\/\d{1,6}$/.test(number) ||
    !number.startsWith(date.slice(0, 4) + "/")
  )
    throw new Error("INVALID_TCMB_DATE");
  const seen = new Set<string>();
  const numeric = (s: string | undefined) => {
    if (s === undefined || s === "") return null;
    if (
      !/^\d{1,8}(?:[.,]\d{1,8})?$/.test(s) ||
      Number(s.replace(",", ".")) <= 0
    )
      throw new Error("INVALID_TCMB_RATE");
    return Number(s.replace(",", "."));
  };
  const rates = rows.map((r) => {
    const unit = Number(r.Unit);
    if (
      !/^[A-Z]{3}$/.test(r.code) ||
      seen.has(r.code) ||
      !Number.isInteger(unit) ||
      unit < 1 ||
      unit > 100000
    )
      throw new Error("INVALID_TCMB_CURRENCY");
    seen.add(r.code);
    const name = r.Isim || r.CurrencyName || r.code;
    if (name.length > 120) throw new Error("INVALID_TCMB_NAME");
    return {
      date,
      currency: r.code as FxQuote["currency"],
      currencyName: name,
      unit,
      forexBuying: numeric(r.ForexBuying),
      forexSelling: numeric(r.ForexSelling),
      banknoteBuying: numeric(r.BanknoteBuying),
      banknoteSelling: numeric(r.BanknoteSelling),
      bulletinNo: number,
      fetchedAtUtc: new Date(now).toISOString(),
    };
  });
  if (
    rates.length < 10 ||
    rates.length > 100 ||
    !["USD", "EUR", "GBP"].every((code) =>
      rates.some((q) => q.currency === code && q.forexBuying && q.forexSelling),
    )
  )
    throw new Error("INCOMPLETE_TCMB_BULLETIN");
  return {
    date,
    number,
    sourceUrl,
    xml,
    sha256: createHash("sha256").update(xml).digest("hex"),
    fetchedAt: now,
    rates,
  };
}
export async function fetchBulletin(
  date?: string,
  fetcher: typeof fetch = fetch,
): Promise<Bulletin | null> {
  const url = tcmbUrl(date);
  const response = await fetcher(url, {
    headers: { Accept: "application/xml", "User-Agent": "ButceTakip-TCMB/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(7000),
  });
  if (response.status === 404 && date) return null;
  if (!response.ok || !response.body) throw new Error("TCMB_UNAVAILABLE");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("TCMB_RESPONSE_TOO_LARGE");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return parseBulletin(
    Buffer.concat(parts).toString("utf8"),
    url,
    Date.now(),
    date,
  );
}
