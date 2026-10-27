export const normalizeIban = (value: string) =>
  value.replace(/\s+/g, "").toUpperCase();
export function validIban(value: string) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const lengths: Record<string, number> = {
    TR: 26,
    OM: 23,
    AE: 23,
    SA: 24,
    QA: 29,
    KW: 30,
    BH: 22,
    GB: 22,
    DE: 22,
    FR: 27,
    NL: 18,
    CH: 21,
    BE: 16,
    ES: 24,
    IT: 27,
  };
  if (lengths[iban.slice(0, 2)] && iban.length !== lengths[iban.slice(0, 2)])
    return false;
  let remainder = 0;
  for (const letter of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /[A-Z]/.test(letter)
      ? String(letter.charCodeAt(0) - 55)
      : letter;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
