import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BudgetData, demoData, emptyData, validateData } from "./model";
import * as api from "./cloudApi";

const KEY = "butce-takip-v1";
const CLOUD_KEY = "butce-takip-cloud-v1";
export type CloudInfo = {
  mode: "local" | "cloud" | "locked";
  enabled: boolean;
  authenticated: boolean;
  email?: string;
  remoteCount: number | null;
  error: string;
};
type Context = {
  data: BudgetData;
  loading: boolean;
  storageError: string;
  update: (fn: (data: BudgetData) => BudgetData) => Promise<void>;
  startFresh: () => Promise<void>;
  cloud: CloudInfo;
  signIn: (email: string, password: string) => Promise<void>;
  startCloud: (uploadLocal: boolean) => Promise<void>;
  reloadCloud: () => Promise<void>;
  leaveCloud: () => Promise<void>;
};
const BudgetContext = createContext<Context | null>(null);
async function readStorage(key = KEY) {
  return Platform.OS === "web"
    ? window.localStorage.getItem(key)
    : AsyncStorage.getItem(key);
}
async function writeStorage(value: string, key = KEY) {
  if (Platform.OS === "web") window.localStorage.setItem(key, value);
  else await AsyncStorage.setItem(key, value);
}
async function clearCloudPreference() {
  if (Platform.OS === "web") window.localStorage.removeItem(CLOUD_KEY);
}
const INITIAL_CLOUD: CloudInfo = {
  mode: "local",
  enabled: false,
  authenticated: false,
  remoteCount: null,
  error: "",
};

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BudgetData>(emptyData());
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [cloud, setCloud] = useState<CloudInfo>(INITIAL_CLOUD);
  const ref = useRef(data);
  const local = useRef(data);
  const snapshot = useRef<api.CloudSnapshot>({ revision: 0, data: null });
  const mode = useRef<CloudInfo["mode"]>("local");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const setCurrent = useCallback((next: BudgetData) => {
    ref.current = next;
    setData(next);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      let localError = false;
      let preferred = false;
      try {
        const raw = await readStorage();
        const parsed = raw ? JSON.parse(raw) : demoData();
        if (!validateData(parsed)) throw new Error("invalid");
        local.current = parsed;
        preferred =
          Platform.OS === "web" && (await readStorage(CLOUD_KEY)) === "1";
        if (!active) return;
        setCurrent(parsed);
      } catch {
        localError = true;
        if (active)
          setStorageError(
            "Yerel veriler okunamadı. Mevcut kayıtlar korunuyor; tarayıcı depolama izinlerini kontrol et.",
          );
      }
      if (preferred) {
        mode.current = "locked";
        if (active) setCurrent(emptyData());
      }
      if (Platform.OS === "web" && !localError) {
        try {
          const status = await api.cloudStatus();
          const remote = status.authenticated
            ? await api.cloudRead()
            : { revision: 0, data: null };
          if (!active) return;
          snapshot.current = remote;
          if (preferred && status.authenticated && remote.data) {
            mode.current = "cloud";
            setCurrent(remote.data);
          }
          setCloud({
            ...status,
            mode: mode.current,
            remoteCount: remote.data?.transactions.length ?? null,
            error:
              preferred && mode.current !== "cloud"
                ? "SQL oturumunu aç veya yerel moda dön. Yerel kopyan korunuyor."
                : "",
          });
        } catch (error) {
          if (active)
            setCloud({
              ...INITIAL_CLOUD,
              enabled: preferred,
              mode: mode.current,
              error: preferred ? (error as Error).message : "",
            });
        }
      }
      if (active) setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [setCurrent]);
  const serial = useCallback(
    (work: () => Promise<void>) => {
      const next = queue.current
        .catch(() => {})
        .then(work)
        .catch((error) => {
          if (
            error instanceof api.CloudError &&
            error.status === 401 &&
            mode.current === "cloud"
          ) {
            mode.current = "locked";
            setCurrent(emptyData());
            setCloud((info) => ({
              ...info,
              mode: "locked",
              authenticated: false,
              error: error.message,
            }));
          }
          throw error;
        });
      queue.current = next;
      return next;
    },
    [setCurrent],
  );
  const update = useCallback(
    (fn: (value: BudgetData) => BudgetData) =>
      serial(async () => {
        if (mode.current === "locked")
          throw new Error(
            "SQL bağlantısı kilitli. Önce oturumunu aç veya yerel moda dön.",
          );
        if (storageError && mode.current === "local")
          throw new Error(
            "Depolama erişimi yok. Mevcut verilerin üzerine yazılmadı.",
          );
        const next = fn(ref.current);
        if (!validateData(next))
          throw new Error("Veriler doğrulanamadı. Kayıt yapılamadı.");
        if (mode.current === "cloud") {
          const revision = await api.cloudWrite(
            snapshot.current.revision,
            next,
          );
          snapshot.current = { revision, data: next };
        } else {
          try {
            await writeStorage(JSON.stringify(next));
          } catch {
            throw new Error(
              "Kaydedilemedi. Tarayıcı depolaması dolu veya kapalı olabilir.",
            );
          }
          local.current = next;
        }
        setCurrent(next);
      }),
    [serial, setCurrent, storageError],
  );
  const signIn = useCallback(
    (email: string, password: string) =>
      serial(async () => {
        if (Platform.OS !== "web")
          throw new Error(
            "SQL oturumu şu an web/PWA sürümünde kullanılabilir.",
          );
        const status = await api.cloudLogin(email, password);
        const remote = await api.cloudRead();
        snapshot.current = remote;
        if (mode.current === "locked" && remote.data) {
          mode.current = "cloud";
          setCurrent(remote.data);
        }
        setCloud({
          ...status,
          mode: mode.current,
          remoteCount: remote.data?.transactions.length ?? null,
          error: "",
        });
      }),
    [serial, setCurrent],
  );
  const startCloud = useCallback(
    (uploadLocal: boolean) =>
      serial(async () => {
        const remote = await api.cloudRead();
        if (uploadLocal && remote.data !== null)
          throw new Error(
            "SQL hesabında kayıt var. Üzerine yazılmadı; sunucudaki bütçeyi açabilirsin.",
          );
        const next = remote.data ?? (uploadLocal ? local.current : emptyData());
        await writeStorage("1", CLOUD_KEY);
        try {
          const revision = remote.data
            ? remote.revision
            : await api.cloudWrite(0, next);
          snapshot.current = { revision, data: next };
          mode.current = "cloud";
          setCurrent(next);
          setCloud((info) => ({
            ...info,
            mode: "cloud",
            remoteCount: next.transactions.length,
            error: "",
          }));
        } catch (error) {
          await clearCloudPreference().catch(() => {});
          throw error;
        }
      }),
    [serial, setCurrent],
  );
  const reloadCloud = useCallback(
    () =>
      serial(async () => {
        const remote = await api.cloudRead();
        if (!remote.data) throw new Error("SQL hesabında henüz bir bütçe yok.");
        snapshot.current = remote;
        mode.current = "cloud";
        setCurrent(remote.data);
        setCloud((info) => ({
          ...info,
          mode: "cloud",
          remoteCount: remote.data!.transactions.length,
          error: "",
        }));
      }),
    [serial, setCurrent],
  );
  const leaveCloud = useCallback(
    () =>
      serial(async () => {
        if (cloud.authenticated) await api.cloudLogout();
        await clearCloudPreference();
        snapshot.current = { revision: 0, data: null };
        mode.current = "local";
        setCurrent(local.current);
        setCloud({ ...INITIAL_CLOUD, enabled: cloud.enabled });
      }),
    [cloud.authenticated, cloud.enabled, serial, setCurrent],
  );
  const startFresh = useCallback(() => update(() => emptyData()), [update]);
  return (
    <BudgetContext.Provider
      value={{
        data,
        loading,
        storageError,
        update,
        startFresh,
        cloud,
        signIn,
        startCloud,
        reloadCloud,
        leaveCloud,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}
export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("BudgetProvider gerekli");
  return context;
}
