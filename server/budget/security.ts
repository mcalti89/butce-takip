import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { validateData, type BudgetData } from "../../lib/budget/model";

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(
    await derive(password, match[1]),
    Buffer.from(match[2], "hex"),
  );
}

export function sameSecret(a: string, b: string) {
  // Compare fixed-length digests rather than leaking a secret's length.
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

/** Preserve the version-1 document, including historical FX snapshots. */
export function validCloudData(value: unknown): value is BudgetData {
  try {
    if (!validateData(value)) return false;
    const data = value;
    if (data.categories.length > 1000 || data.transactions.length > 50000)
      return false;
    const ids = new Set<string>();
    for (const category of data.categories) {
      if (
        !category.id ||
        category.id.length > 191 ||
        ids.has(category.id) ||
        !category.name.trim() ||
        category.name.length > 40 ||
        category.icon.length > 80 ||
        category.color.length > 40 ||
        ["__proto__", "constructor", "prototype"].includes(category.id)
      )
        return false;
      ids.add(category.id);
    }
    ids.clear();
    for (const transaction of data.transactions) {
      if (
        !transaction.id ||
        transaction.id.length > 191 ||
        ids.has(transaction.id) ||
        transaction.description.length > 300 ||
        transaction.amount > 999999999
      )
        return false;
      ids.add(transaction.id);
    }
    if (Array.isArray(data.budgets) || Object.keys(data.budgets).length > 2400)
      return false;
    for (const budgets of Object.values(data.budgets)) {
      if (
        Array.isArray(budgets) ||
        Object.values(budgets).some((n) => n > 999999999)
      )
        return false;
    }
    return Buffer.byteLength(JSON.stringify(data), "utf8") <= 5 * 1024 * 1024;
  } catch {
    return false;
  }
}
