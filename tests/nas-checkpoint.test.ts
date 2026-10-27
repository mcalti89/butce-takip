import { describe, expect, it } from "vitest";
import { verifyNasCheckpoint } from "../server/nas/checkpoint";
import { TABLES } from "../server/nas/snapshot";

const expected = TABLES.map((table) => ({
  table: table[0],
  rows: 0,
  sha256: "a".repeat(64),
}));
function client(tables: unknown, status = 200) {
  return {
    request: async () => ({
      status,
      headers: {},
      body: Buffer.from(JSON.stringify({ tables })).toString("base64"),
    }),
  };
}
describe("NAS final cutover guard", () => {
  it("accepts all fourteen verified table counts and hashes", async () => {
    await expect(
      verifyNasCheckpoint(client(expected), expected),
    ).resolves.toBeUndefined();
  });
  it("stops cutover if a target row or its content changed", async () => {
    for (const change of [{ rows: 1 }, { sha256: "b".repeat(64) }]) {
      const altered = expected.map((row, index) =>
        index === 2 ? { ...row, ...change } : row,
      );
      await expect(
        verifyNasCheckpoint(client(altered), expected),
      ).rejects.toThrow("NAS_CHECKPOINT_CHANGED");
    }
  });
  it("rejects missing tables, invalid expected data and unavailable checkpoints", async () => {
    await expect(
      verifyNasCheckpoint(client(expected.slice(1)), expected),
    ).rejects.toThrow();
    await expect(verifyNasCheckpoint(client(expected), [])).rejects.toThrow();
    await expect(
      verifyNasCheckpoint(client(expected, 503), expected),
    ).rejects.toThrow();
  });
});
