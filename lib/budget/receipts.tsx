import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { useBudget } from "./store";
import { cloudReceipts } from "./cloudApi";
import { receiptKey, type Receipt } from "./receipt-model";
type Index = {
  receipts: Receipt[];
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Index>({
  receipts: [],
  error: "",
  refresh: async () => {},
});
export function ReceiptProvider({ children }: { children: React.ReactNode }) {
  const { cloud, data } = useBudget();
  const accountId = cloud.authenticated ? cloud.accountId : undefined;
  const [snapshot, setSnapshot] = useState<{
    accountId?: string;
    receipts: Receipt[];
    error: string;
  }>({ receipts: [], error: "" });
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(async () => {
    setRefreshToken((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    const load = () => {
      void cloudReceipts(accountId)
        .then((receipts) => {
          if (active) setSnapshot({ accountId, receipts, error: "" });
        })
        .catch((e: Error) => {
          if (active)
            setSnapshot((old) => ({
              accountId,
              receipts: old.accountId === accountId ? old.receipts : [],
              error: e.message,
            }));
        });
    };
    load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    if (typeof window !== "undefined") window.addEventListener("focus", load);
    return () => {
      active = false;
      subscription.remove();
      if (typeof window !== "undefined")
        window.removeEventListener("focus", load);
    };
  }, [accountId, data.transactions, data.accountTransfers, refreshToken]);
  const current =
    snapshot.accountId === accountId && accountId
      ? snapshot
      : { receipts: [], error: "" };
  return (
    <Context.Provider value={{ ...current, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useReceiptIndex = () => useContext(Context);
export function useReceiptCount() {
  const { receipts } = useReceiptIndex();
  const counts = new Map<string, number>();
  for (const r of receipts) {
    const key = receiptKey(r.kind, r.entryId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (kind: Receipt["kind"], entryId: string) =>
    counts.get(receiptKey(kind, entryId)) ?? 0;
}
