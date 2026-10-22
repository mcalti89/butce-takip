import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BudgetData, demoData, emptyData, validateData } from "./model";
const KEY = "butce-takip-v1";
const BudgetContext = createContext<{
  data: BudgetData;
  loading: boolean;
  storageError: string;
  update: (fn: (d: BudgetData) => BudgetData) => Promise<void>;
  startFresh: () => Promise<void>;
} | null>(null);
async function readStorage() {
  return Platform.OS === "web"
    ? window.localStorage.getItem(KEY)
    : AsyncStorage.getItem(KEY);
}
async function writeStorage(value: string) {
  if (Platform.OS === "web") window.localStorage.setItem(KEY, value);
  else await AsyncStorage.setItem(KEY, value);
}
export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BudgetData>(emptyData());
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const ref = useRef(data);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    readStorage()
      .then((raw) => {
        if (!active) return;
        if (!raw) {
          const demo = demoData();
          ref.current = demo;
          setData(demo);
          return;
        }
        const parsed = JSON.parse(raw);
        if (!validateData(parsed)) throw new Error("invalid");
        ref.current = parsed;
        setData(parsed);
      })
      .catch(() => {
        if (active)
          setStorageError(
            "Yerel veriler okunamadı. Mevcut kayıtlar korunuyor; tarayıcı depolama izinlerini kontrol et.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = useCallback(
    (fn: (d: BudgetData) => BudgetData) => {
      const next = queue.current
        .catch(() => {})
        .then(async () => {
          if (storageError)
            throw new Error(
              "Depolama erişimi yok. Mevcut verilerin üzerine yazılmadı.",
            );
          const changed = fn(ref.current);
          if (!validateData(changed))
            throw new Error("Veriler doğrulanamadı. Kayıt yapılamadı.");
          try {
            await writeStorage(JSON.stringify(changed));
          } catch {
            throw new Error(
              "Kaydedilemedi. Tarayıcı depolaması dolu veya kapalı olabilir.",
            );
          }
          ref.current = changed;
          setData(changed);
        });
      queue.current = next;
      return next;
    },
    [storageError],
  );
  const startFresh = useCallback(() => update(() => emptyData()), [update]);
  const contextValue = useMemo(
    () => ({ data, loading, storageError, update, startFresh }),
    [data, loading, storageError, update, startFresh],
  );
  return (
    <BudgetContext.Provider value={contextValue}>
      {children}
    </BudgetContext.Provider>
  );
}
export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("BudgetProvider gerekli");
  return context;
}
