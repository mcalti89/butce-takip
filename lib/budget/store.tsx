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
import { BudgetData, emptyData, validateData } from "./model";
import { isPristineBudget } from "./account";
import * as api from "./cloudApi";

const LEGACY_KEY = "butce-takip-v1";
const AUTH_EVENT = "butce-takip-auth-event";
export type CloudInfo = api.CloudStatus & {
  mode: "local" | "cloud" | "locked";
  remoteCount: number | null;
  error: string;
};
type Context = {
  data: BudgetData;
  loading: boolean;
  storageError: string;
  cloud: CloudInfo;
  legacyCount: number;
  canImportLegacy: boolean;
  update: (fn: (data: BudgetData) => BudgetData) => Promise<void>;
  startFresh: () => Promise<void>;
  signInGoogle: (credential: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  importLegacy: () => Promise<void>;
  reloadCloud: () => Promise<void>;
  leaveCloud: () => Promise<void>;
};
const BudgetContext = createContext<Context | null>(null);
const INITIAL: CloudInfo = {
  mode: "locked",
  enabled: false,
  googleEnabled: false,
  authenticated: false,
  remoteCount: null,
  error: "",
};
function announceAuthChange() {
  try {
    if (Platform.OS === "web")
      localStorage.setItem(AUTH_EVENT, `${Date.now()}-${Math.random()}`);
  } catch {
    /* Login does not depend on browser storage. */
  }
}
export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BudgetData>(emptyData());
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [cloud, setCloud] = useState<CloudInfo>(INITIAL);
  const [legacyCount, setLegacyCount] = useState(0);
  const [canImportLegacy, setCanImportLegacy] = useState(false);
  const current = useRef(data);
  const accountId = useRef("");
  const legacy = useRef<BudgetData | null>(null);
  const snapshot = useRef<api.CloudSnapshot | null>(null);
  const epoch = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const setCurrent = useCallback((next: BudgetData) => {
    current.current = next;
    setData(next);
    setCanImportLegacy(Boolean(legacy.current) && isPristineBudget(next));
  }, []);
  const clearMemory = useCallback(() => {
    accountId.current = "";
    snapshot.current = null;
    legacy.current = null;
    setLegacyCount(0);
    setStorageError("");
    setCurrent(emptyData());
  }, [setCurrent]);
  const lock = useCallback(
    (error: string) => {
      epoch.current++;
      clearMemory();
      setCloud((info) => ({
        ...info,
        mode: "locked",
        authenticated: false,
        accountId: undefined,
        email: undefined,
        legacyImportAllowed: false,
        error,
      }));
    },
    [clearMemory],
  );
  const loadAccount = useCallback(
    async (status: api.CloudStatus, generation: number) => {
      if (!status.googleEnabled || !status.authenticated || !status.accountId) {
        if (epoch.current === generation)
          setCloud({
            ...INITIAL,
            ...status,
            authenticated: false,
            mode: "locked",
          });
        return;
      }
      let remote = await api.cloudRead(status.accountId);
      if (!remote.data) {
        try {
          await api.cloudWrite(status.accountId, 0, emptyData());
        } catch (error) {
          if (
            !(
              error instanceof api.CloudError &&
              error.status === 409 &&
              error.code !== "ACCOUNT_CHANGED"
            )
          )
            throw error;
        }
        remote = await api.cloudRead(status.accountId);
      }
      if (!remote.data)
        throw new Error("Hesabın bütçesi açılamadı. Yeniden dene.");
      let old: BudgetData | null = null;
      let oldError = "";
      if (status.legacyImportAllowed) {
        try {
          const raw =
            Platform.OS === "web"
              ? localStorage.getItem(LEGACY_KEY)
              : await AsyncStorage.getItem(LEGACY_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (!validateData(parsed)) throw new Error();
            if (!parsed.demo) old = parsed;
          }
        } catch {
          oldError =
            "Bu cihazdaki eski bütçe okunamadı. Özgün kayıtlar değiştirilmedi.";
        }
      }
      if (epoch.current !== generation) return;
      accountId.current = status.accountId;
      snapshot.current = remote;
      legacy.current = old;
      setLegacyCount(old?.transactions.length ?? 0);
      setStorageError(oldError);
      setCurrent(remote.data);
      setCloud({
        ...status,
        mode: "cloud",
        remoteCount: remote.data.transactions.length,
        error: "",
      });
    },
    [setCurrent],
  );
  const refreshSession = useCallback(async () => {
    const generation = ++epoch.current;
    clearMemory();
    setLoading(true);
    try {
      await loadAccount(await api.cloudStatus(), generation);
    } catch (error) {
      if (epoch.current === generation)
        setCloud((info) => ({
          ...info,
          authenticated: false,
          mode: "locked",
          error: (error as Error).message,
        }));
    } finally {
      if (epoch.current === generation) setLoading(false);
    }
  }, [clearMemory, loadAccount]);
  useEffect(() => {
    void refreshSession();
    if (Platform.OS !== "web") return;
    const changed = (event: StorageEvent) => {
      if (event.key === AUTH_EVENT) void refreshSession();
    };
    const focus = () => {
      if (!accountId.current) return;
      const expected = accountId.current;
      void api
        .cloudStatus()
        .then((status) => {
          if (
            accountId.current === expected &&
            (!status.authenticated || status.accountId !== expected)
          )
            void refreshSession();
        })
        .catch((error) => {
          if (accountId.current === expected) lock((error as Error).message);
        });
    };
    const visible = () => {
      if (document.visibilityState === "visible") focus();
    };
    window.addEventListener("storage", changed);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      epoch.current++;
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshSession, lock]);
  const serial = useCallback(
    (work: () => Promise<void>) => {
      const next = queue.current
        .catch(() => {})
        .then(work)
        .catch((error) => {
          if (
            error instanceof api.CloudError &&
            (error.status === 401 || error.code === "ACCOUNT_CHANGED")
          )
            lock(error.message);
          throw error;
        });
      queue.current = next;
      return next;
    },
    [lock],
  );
  const update = useCallback(
    (fn: (value: BudgetData) => BudgetData) => {
      const expected = accountId.current;
      const generation = epoch.current;
      return serial(async () => {
        if (
          !expected ||
          expected !== accountId.current ||
          generation !== epoch.current ||
          !snapshot.current
        )
          throw new Error("Önce Google hesabınla giriş yap.");
        const next = fn(current.current);
        if (!validateData(next))
          throw new Error("Veriler doğrulanamadı. Kayıt yapılamadı.");
        const revision = await api.cloudWrite(
          expected,
          snapshot.current.revision,
          next,
        );
        if (expected !== accountId.current || generation !== epoch.current)
          throw new Error("Hesap değişti. Eski ekranın verileri açılmadı.");
        snapshot.current = { accountId: expected, revision, data: next };
        setCurrent(next);
      });
    },
    [serial, setCurrent],
  );
  const signInGoogle = useCallback(
    async (credential: string) => {
      const generation = ++epoch.current;
      clearMemory();
      setLoading(true);
      try {
        await loadAccount(await api.cloudGoogleLogin(credential), generation);
        announceAuthChange();
      } catch (error) {
        if (epoch.current === generation)
          setCloud((info) => ({
            ...info,
            authenticated: false,
            mode: "locked",
            error: (error as Error).message,
          }));
        throw error;
      } finally {
        if (epoch.current === generation) setLoading(false);
      }
    },
    [clearMemory, loadAccount],
  );
  const reloadCloud = useCallback(() => {
    const expected = accountId.current;
    const generation = epoch.current;
    return serial(async () => {
      if (!expected) throw new Error("Önce giriş yap.");
      const remote = await api.cloudRead(expected);
      if (!remote.data) throw new Error("Bütçe bulunamadı; yeniden giriş yap.");
      if (expected !== accountId.current || generation !== epoch.current)
        return;
      snapshot.current = remote;
      setCurrent(remote.data);
      setCloud((info) => ({
        ...info,
        remoteCount: remote.data!.transactions.length,
        error: "",
      }));
    });
  }, [serial, setCurrent]);
  const importLegacy = useCallback(() => {
    const expected = accountId.current;
    const generation = epoch.current;
    return serial(async () => {
      if (!expected || !legacy.current || !cloud.legacyImportAllowed)
        throw new Error("Bu hesap için aktarılabilecek eski bütçe bulunamadı.");
      const remote = await api.cloudRead(expected);
      if (!remote.data || !isPristineBudget(remote.data))
        throw new Error(
          "Hesabında zaten değişiklikler var. Eski bütçe bunların üzerine yazılmadı.",
        );
      const next = legacy.current;
      const revision = await api.cloudWrite(expected, remote.revision, next);
      if (expected !== accountId.current || generation !== epoch.current)
        return;
      snapshot.current = { accountId: expected, revision, data: next };
      setCurrent(next);
    });
  }, [serial, setCurrent, cloud.legacyImportAllowed]);
  const leaveCloud = useCallback(
    () =>
      serial(async () => {
        try {
          await api.cloudLogout();
        } catch (error) {
          if (!(error instanceof api.CloudError && error.status === 401))
            throw error;
        }
        epoch.current++;
        clearMemory();
        setCloud((info) => ({
          ...INITIAL,
          enabled: info.enabled,
          googleEnabled: info.googleEnabled,
        }));
        announceAuthChange();
      }),
    [serial, clearMemory],
  );
  const startFresh = useCallback(() => update(() => emptyData()), [update]);
  return (
    <BudgetContext.Provider
      value={{
        data,
        loading,
        storageError,
        cloud,
        legacyCount,
        canImportLegacy,
        update,
        startFresh,
        signInGoogle,
        refreshSession,
        importLegacy,
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
