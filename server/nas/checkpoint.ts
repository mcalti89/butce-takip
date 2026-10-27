import { decodeBody, MAX_REQUEST } from "./protocol";
import type { NasBackendClient } from "./remote";
import { sameSummary, validSummary } from "./snapshot";

// A cutover build must still see exactly the frozen, verified final snapshot.
// This is a build-time guard; it never runs on customer requests.
export async function verifyNasCheckpoint(
  client: Pick<NasBackendClient, "request">,
  expected: unknown,
) {
  if (!validSummary(expected)) throw new Error("INVALID_NAS_CHECKPOINT");
  const reply = await client.request({
    method: "POST",
    path: "/internal/migration",
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ action: "fingerprint" })).toString(
      "base64",
    ),
  });
  if (reply.status !== 200) throw new Error("NAS_CHECKPOINT_UNAVAILABLE");
  const actual = JSON.parse(decodeBody(reply.body, MAX_REQUEST).toString());
  if (!validSummary(actual.tables) || !sameSummary(actual.tables, expected))
    throw new Error("NAS_CHECKPOINT_CHANGED");
}
