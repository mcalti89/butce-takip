import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBudget } from "@/lib/budget/store";
import { downloadBackup } from "@/lib/budget/backup";
import { Button, C, Card, ErrorText, IconButton, Sheet, Txt } from "./ui";

export function AccountPopup({
  desktop,
  onClose,
}: {
  desktop: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [onClose]);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hesap menüsünü kapat"
          onPress={onClose}
          style={{ position: "absolute", inset: 0, backgroundColor: "#02060B66" }}
        />
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            width: 340,
            maxWidth: "90%",
            ...(desktop
              ? { left: 20, bottom: 82 }
              : { right: 18, top: Math.max(insets.top, 18) + 52 }),
          }}
        >
          <CloudPanel compact />
          <View style={{ position: "absolute", right: 8, top: 8 }}>
            <IconButton name="x" label="Kapat" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CloudPanel({ compact = false }: { compact?: boolean }) {
  const {
    data,
    cloud,
    legacyCount,
    canImportLegacy,
    importLegacy,
    reloadCloud,
    leaveCloud,
  } = useBudget();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <View style={{ gap: compact ? 8 : 12 }}>
        <Txt bold style={{ fontSize: compact ? 14 : 19 }}>
          {compact ? "Google hesabın" : "Hesabım ve yedekler"}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: compact ? 12 : 14 }}>
          {cloud.email}
        </Txt>
        {!compact && (
          <Txt style={{ color: C.muted }}>
            Bütçen bu hesaba özel saklanır. Başka bir cihazda aynı Google
            hesabıyla giriş yapabilirsin. Değişiklikleri kaydetmek için internet
            gerekir.
          </Txt>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button
            kind="secondary"
            small={compact}
            busy={busy}
            onPress={() => void run(reloadCloud)}
          >
            Son verileri yükle
          </Button>
          <Button
            kind="ghost"
            small={compact}
            busy={busy}
            onPress={() => void run(leaveCloud)}
          >
            Çıkış yap
          </Button>
        </View>
        {!compact && (
          <>
            <Button
              kind="secondary"
              busy={busy}
              onPress={() => void run(() => downloadBackup(data))}
            >
              Tam JSON yedeğini indir
            </Button>
            {canImportLegacy && (
              <>
                <Txt style={{ color: C.amber }}>
                  Bu cihazda önceki sürümden kalan {legacyCount} işlem
                  bulunuyor. Hesabın şu an boş; istersen bu kayıtları
                  aktarabilirsin.
                </Txt>
                <Button
                  kind="secondary"
                  busy={busy}
                  onPress={() => setConfirm(true)}
                >
                  Eski bütçemi bu hesaba aktar
                </Button>
              </>
            )}
          </>
        )}
        <ErrorText message={error} />
      </View>
      {confirm && (
        <Sheet
          title="Eski bütçen bu hesaba aktarılsın mı?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <Txt style={{ color: C.muted, marginVertical: 16 }}>
            {cloud.email} hesabına {legacyCount} işlemle birlikte kategoriler,
            bütçeler, tasarruf hedefleri ve kur kayıtları aktarılır. Bu
            cihazdaki özgün kopya korunur. Hesabında değişiklik varsa üzerine
            yazılmaz.
          </Txt>
          <ErrorText message={error} />
          <Button
            busy={busy}
            onPress={() =>
              void run(async () => {
                await importLegacy();
                setConfirm(false);
              })
            }
          >
            Aktarımı onayla
          </Button>
        </Sheet>
      )}
    </Card>
  );
}
