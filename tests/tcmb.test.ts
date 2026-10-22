import { describe, expect, it, vi } from "vitest";
import {
  fetchBulletin,
  initialArchiveDate,
  istanbulDate,
  parseBulletin,
  tcmbUrl,
  validDate,
} from "../server/fx/tcmb";
import { tcmbFixture } from "./fixtures/tcmb";
const now = Date.parse("2026-10-22T00:00:00Z");
function parse(xml = tcmbFixture(), date?: string) {
  return parseBulletin(xml, tcmbUrl(date), now, date);
}
describe("TCMB kaynak doğrulaması", () => {
  it("bülten tarihini ve alış/satış birimlerini korur, XML entity çözer", () => {
    const b = parse();
    expect(b.date).toBe("2026-10-21");
    expect(b.rates).toHaveLength(10);
    expect(b.rates[0].currencyName).toBe("ABD & doları");
    expect(b.rates.find((r) => r.currency === "JPY")?.unit).toBe(100);
    expect(b.rates[0].banknoteBuying).toBeNull();
    expect(b.rates[0].forexSelling).toBe(31.25);
    expect(b.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "1995-12-31",
    "2026-1-01",
    "https://example.test",
  ])("geçersiz tarih ve kaynak yolu reddeder: %s", (d) => {
    expect(validDate(d)).toBe(false);
    expect(() => tcmbUrl(d)).toThrow();
  });
  it("sabit TCMB HTTPS adresinden tarihsel URL oluşturur", () =>
    expect(tcmbUrl("2026-10-21")).toBe(
      "https://www.tcmb.gov.tr/kurlar/202610/21102026.xml",
    ));
  it("gün sınırını Türkiye saatine göre belirler ve yıl geçişinde arşiv başlangıcı doğrudur", () => {
    expect(istanbulDate(Date.parse("2026-10-21T22:00:00Z"))).toBe("2026-10-22");
    expect(initialArchiveDate("2026-01-31")).toBe("2025-10-01");
  });
  it.each([
    ["HTML", "<html>unavailable</html>"],
    [
      "DTD",
      '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + tcmbFixture(),
    ],
    [
      "eksik bülten",
      tcmbFixture().replace('CurrencyCode="USD"', 'CurrencyCode="ZZZ"'),
    ],
    [
      "yinelenen döviz",
      tcmbFixture().replace('CurrencyCode="EUR"', 'CurrencyCode="USD"'),
    ],
    ["geçersiz oran", tcmbFixture().replace("31.1250", "-31.1250")],
    [
      "geçersiz birim",
      tcmbFixture().replace("<Unit>100</Unit>", "<Unit>0</Unit>"),
    ],
    ["kapanmamış XML", tcmbFixture().slice(0, -15)],
    ["gelecek bülten", tcmbFixture("2026-10-23")],
  ])("%s veritabanına kaydedilmeden reddedilir", (_, xml) =>
    expect(() => parse(xml)).toThrow(),
  );
  it("tarihsel kaynak başka günün bültenini döndürürse reddeder", () =>
    expect(() => parse(tcmbFixture(), "2026-10-20")).toThrow(
      "INVALID_TCMB_DATE",
    ));
  it("tatil/hafta sonu 404 yanıtını kur uydurmadan boş döndürür", async () => {
    const fake = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    expect(await fetchBulletin("2026-10-18", fake)).toBeNull();
    expect(fake.mock.calls[0][0]).toBe(tcmbUrl("2026-10-18"));
  });
  it("kaynak hatasını veya bozuk XML yanıtını başarı kabul etmez", async () => {
    await expect(
      fetchBulletin(
        undefined,
        vi.fn().mockResolvedValue(new Response("", { status: 503 })),
      ),
    ).rejects.toThrow();
    await expect(
      fetchBulletin(
        undefined,
        vi.fn().mockResolvedValue(new Response("<html/>", { status: 200 })),
      ),
    ).rejects.toThrow();
  });
});
