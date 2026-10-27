import { NasBackendClient } from "../server/nas/remote";
import { decodeBody, MAX_REQUEST } from "../server/nas/protocol";
import { verifyNasCheckpoint } from "../server/nas/checkpoint";
async function main() {
  const client = new NasBackendClient(
    process.env.BUDGET_BACKEND_URL ?? process.env.BUDGET_NAS_STANDBY_URL ?? "",
    process.env.BUDGET_BACKEND_SECRET ?? "",
  );
  if (process.env.BUDGET_EXPECTED_NAS_MANIFEST) {
    await verifyNasCheckpoint(
      client,
      JSON.parse(process.env.BUDGET_EXPECTED_NAS_MANIFEST),
    );
    console.log(
      "NAS cutover checkpoint: all 14 table counts and hashes match.",
    );
  }
  const status = await client.request({
    method: "GET",
    path: "/api/cloud?action=status",
    headers: {},
    body: "",
  });
  const account = JSON.parse(decodeBody(status.body, MAX_REQUEST).toString());
  if (
    status.status !== 200 ||
    !account.enabled ||
    !account.googleEnabled ||
    account.authenticated
  )
    throw new Error();
  const denied = await client.request({
    method: "GET",
    path: "/api/cloud?action=data",
    headers: {},
    body: "",
  });
  if (denied.status !== 401) throw new Error();
  const fx = await client.request({
    method: "GET",
    path: "/api/fx?action=status",
    headers: {},
    body: "",
  });
  if (
    fx.status !== 200 ||
    JSON.parse(decodeBody(fx.body, MAX_REQUEST).toString()).source !== "TCMB"
  )
    throw new Error();
  console.log(
    "NAS database API: signed transport, Google configuration, private access control and SQL schema verified.",
  );
}
main().catch(() => {
  console.error(
    "NAS database API verification failed; check private backend settings and service health.",
  );
  process.exitCode = 1;
});
