import type { BudgetData } from "./model";
export async function downloadBackup(data: BudgetData) {
  const file = new Blob(
    [
      JSON.stringify(
        {
          format: "butce-takip-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          data,
        },
        null,
        2,
      ),
    ],
    { type: "application/json;charset=utf-8" },
  );
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = `butce-tam-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
