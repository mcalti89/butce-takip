import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, C, Card, Icon, Sheet, Txt } from "./ui";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export default function PwaPanel({ compact = false }: { compact?: boolean }) {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [online, setOnline] = useState(true);
  const [help, setHelp] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isProduction = process.env.NODE_ENV === "production";
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => setInstalled(media.matches);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstall(null);
    };
    const onOnline = () => setOnline(navigator.onLine);
    syncInstalled();
    onOnline();
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    media.addEventListener("change", syncInstalled);
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const onWorkerState = () => {
      if (!active || worker?.state !== "installed") return;
      if (navigator.serviceWorker.controller)
        setWaiting(registration?.waiting || null);
      else setWorkerReady(true);
    };
    const onUpdate = () => {
      worker = registration?.installing || null;
      worker?.addEventListener("statechange", onWorkerState);
    };
    if (
      isProduction &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          if (!active) return;
          registration = reg;
          setWorkerReady(Boolean(reg.active));
          setWaiting(reg.waiting);
          reg.addEventListener("updatefound", onUpdate);
          if (reg.installing) onUpdate();
        })
        .catch(() => {
          if (active)
            setError(
              "Çevrim dışı kabuk hazırlanamadı. Çevrim içi kullanım devam eder.",
            );
        });
    }
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      media.removeEventListener("change", syncInstalled);
      registration?.removeEventListener("updatefound", onUpdate);
      worker?.removeEventListener("statechange", onWorkerState);
    };
  }, [isProduction]);
  const promptInstall = async () => {
    if (!install) {
      setHelp(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } catch {
      setInstall(null);
      setHelp(true);
    } finally {
      setBusy(false);
    }
  };
  const applyUpdate = () => {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    waiting.postMessage({ type: "SKIP_WAITING" });
  };
  return (
    <>
      <Card
        style={{
          padding: compact ? 14 : 20,
          backgroundColor: "#142437",
          borderColor: "#2B415B",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <View
            style={{
              backgroundColor: "#60A5FA14",
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Icon name="monitor" color={C.blue} size={21} />
          </View>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Txt bold style={{ fontSize: compact ? 12 : 15 }}>
              {installed
                ? "PWA kullanıma hazır"
                : "Windows’ta uygulama gibi kullan"}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
              {online
                ? isProduction
                  ? workerReady
                    ? "Çevrim içi · uygulama kabuğu hazır"
                    : "Çevrim içi · kabuk hazırlanıyor"
                  : "Geliştirme önizlemesi · çevrim dışı kabuk yayın sürümünde"
                : "Çevrim dışı · hesap bağlantısı gerekli"}
            </Txt>
          </View>
          {!installed ? (
            <Button
              kind="secondary"
              small
              icon="download"
              onPress={promptInstall}
              busy={busy}
            >
              {install ? "Windows’a kur" : "Kurulum yönergeleri"}
            </Button>
          ) : (
            <Button
              kind="ghost"
              small
              icon="info"
              onPress={() => setHelp(true)}
            >
              PWA bilgisi
            </Button>
          )}
          {waiting ? (
            <Button small icon="refresh-cw" onPress={applyUpdate}>
              Güncellemeyi uygula
            </Button>
          ) : null}
        </View>
        {!compact ? (
          <Txt style={{ color: C.muted, fontSize: 11, marginTop: 12 }}>
            Bağlantı simgesi internet durumunu gösterir. Google oturumunu ve
            kayıt konumunu Veri yönetimi bölümünden kontrol edebilirsin.
          </Txt>
        ) : null}
        {error ? (
          <Txt
            accessibilityRole="alert"
            style={{ color: C.amber, fontSize: 11, marginTop: 10 }}
          >
            {error}
          </Txt>
        ) : null}
      </Card>
      {help ? (
        <Sheet
          title="Windows PWA kurulumu"
          subtitle="Masaüstünden aç. Ayrı pencerede kullan."
          onClose={() => setHelp(false)}
        >
          <Txt bold style={{ color: C.blue, marginTop: 14, marginBottom: 10 }}>
            Microsoft Edge veya Google Chrome
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 13 }}>
            Uygulamanın kalıcı HTTPS adresini normal bir sekmede aç. Adres
            çubuğundaki yükleme simgesini veya tarayıcı menüsündeki “Uygulamalar
            / Bu siteyi uygulama olarak yükle” ya da “Yükle” seçeneğini kullan.
            Tarayıcı sürümüne göre etiket değişebilir.
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>
            Manus içindeki gömülü önizleme kurulum istemini engelleyebilir.
            Önizlemeyi ayrı sekmede aç; güvenli bir kalıcı yayın adresi kurulumu
            taşımak için gereklidir. Geliştirme önizlemesinde çevrim dışı
            önbellek etkin değildir.
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>
            Yayın sürümünde ilk çevrim içi açılış ve kabuk hazırlığı
            tamamlandıktan sonra uygulama kabuğu çevrim dışı açılabilir. Hesap
            verileri service worker önbelleğine yazılmaz. Bütçeni açmak için
            internet ve açık Google oturumu gerekir; çevrim dışı değişiklikler
            sunucuya gönderilmek üzere biriktirilmez.
          </Txt>
          <Txt
            style={{
              color: C.amber,
              fontSize: 12,
              marginTop: 14,
              marginBottom: 18,
            }}
          >
            Başka cihazdan bütçeni açmak için aynı Google hesabıyla giriş yap.
            Tam JSON yedeği tüm bütçeyi, CSV ise yalnızca işlemleri içerir.
          </Txt>
          <Button onPress={() => setHelp(false)} icon="check">
            Anladım
          </Button>
        </Sheet>
      ) : null}
    </>
  );
}
