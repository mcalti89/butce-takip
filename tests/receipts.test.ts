import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { parseReceipt } from "../server/budget/receipts";
import { MAX_RECEIPT_BYTES } from "../lib/budget/receipt-model";
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
);
const file = () => ({
  id: randomUUID(),
  kind: "transaction",
  entryId: "tx-1",
  name: "Banka dekontu.pdf",
  base64: pdf.toString("base64"),
});
describe("PDF dekont doğrulama", () => {
  it("PDF içeriğinin boyutunu ve hashini sunucuda hesaplar", () => {
    const parsed = parseReceipt({ ...file(), size: 1 });
    expect(parsed.content).toEqual(pdf);
    expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("yalnızca dosya uzantısını değiştirerek yüklemeyi engeller", () => {
    expect(() =>
      parseReceipt({
        ...file(),
        base64: Buffer.from("<html>not a pdf</html>").toString("base64"),
      }),
    ).toThrow("PDF biçiminde değil");
    expect(() =>
      parseReceipt({
        ...file(),
        base64: Buffer.from("%PDF-1.4 truncated").toString("base64"),
      }),
    ).toThrow("PDF biçiminde değil");
  });
  it("başlık ve dosya yolu enjeksiyonunu engeller", () => {
    for (const name of [
      "../a.pdf",
      "C:\\a.pdf",
      "a\r\nb.pdf",
      "x.txt",
      "x.pdf\u0000",
      "x".repeat(181) + ".pdf",
    ])
      expect(() => parseReceipt({ ...file(), name })).toThrow();
  });
  it("bozuk base64 ve uygunsuz hedefleri reddeder", () => {
    for (const base64 of ["", "%%%%", "YQ=", "YQ===", "YWJ=", "YW Jj"])
      expect(() => parseReceipt({ ...file(), base64 })).toThrow();
    for (const value of [
      { kind: "investment" },
      { kind: ["transaction"] },
      { entryId: "../../other" },
      { id: "not-an-id" },
      null,
    ])
      expect(() =>
        parseReceipt(value === null ? null : { ...file(), ...value }),
      ).toThrow();
  });
  it("tam 3 MB kabul eder, üst sınırı içerikten denetler", () => {
    const bytes = Buffer.alloc(MAX_RECEIPT_BYTES, 32);
    pdf.copy(bytes, 0);
    Buffer.from("\n%%EOF").copy(bytes, bytes.length - 6);
    expect(
      parseReceipt({ ...file(), base64: bytes.toString("base64") }).content
        .length,
    ).toBe(MAX_RECEIPT_BYTES);
    expect(() =>
      parseReceipt({
        ...file(),
        base64: Buffer.concat([bytes, Buffer.from(" ")]).toString("base64"),
      }),
    ).toThrow("3 MB");
  });
});
