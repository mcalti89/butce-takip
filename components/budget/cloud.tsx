import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import { downloadBackup } from "@/lib/budget/backup";
import { Button, C, Card, ErrorText, Field, Sheet, Txt } from "./ui";

export function CloudPanel({ compact = false }: { compact?: boolean }) {
  const { data, cloud, signIn, startCloud, reloadCloud, leaveCloud } =
    useBudget();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
  if (compact && cloud.mode === "local") return null;
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <Txt bold style={{ fontSize: 19 }}>
          {cloud.mode === "cloud"
            ? "SQL bütçen açık"
            : cloud.mode === "locked"
              ? "SQL oturumu bekleniyor"
              : "Cihazlar arası SQL bütçesi"}
        </Txt>
        <Txt style={{ color: C.muted }}>
          {cloud.mode === "cloud"
            ? `${cloud.email ?? ""} · Kayıtlar SQL sunucusunda saklanır. Kaydetmek için internet gerekir. Diğer cihazdaki değişiklikler için son verileri yükle.`
            : "Yerel kopyan korunur. SQL hesabına giriş yaptıktan sonra hangi bütçeyi açacağını seçebilirsin."}
        </Txt>
        {!cloud.enabled && (
          <Txt style={{ color: C.amber }}>
            Kalıcı SQL bağlantısı henüz yapılandırılmadı. Cihazındaki bütçeyi
            kullanmaya devam edebilirsin.
          </Txt>
        )}
        {cloud.enabled && !cloud.authenticated && (
          <>
            <Field
              label="SQL e-posta"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <Field
              label="SQL parola"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
            <Button
              busy={busy}
              disabled={!email || !password}
              onPress={() =>
                void run(async () => {
                  await signIn(email, password);
                  setPassword("");
                })
              }
            >
              SQL hesabına giriş yap
            </Button>
          </>
        )}
        {cloud.authenticated && cloud.mode !== "cloud" && (
          <>
            {cloud.remoteCount === null ? (
              <>
                <Button busy={busy} onPress={() => setConfirm(true)}>
                  Bu cihazdaki kayıtları SQL’e aktar
                </Button>
                <Button
                  kind="secondary"
                  busy={busy}
                  onPress={() => void run(() => startCloud(false))}
                >
                  SQL’de boş bütçe ile başla
                </Button>
              </>
            ) : (
              <Button
                busy={busy}
                onPress={() => void run(() => startCloud(false))}
              >
                Sunucudaki bütçeyi aç ({cloud.remoteCount} işlem)
              </Button>
            )}
          </>
        )}
        {cloud.mode === "cloud" && (
          <Button
            kind="secondary"
            busy={busy}
            onPress={() => void run(reloadCloud)}
          >
            Sunucudaki son verileri yükle
          </Button>
        )}
        {!compact && (
          <Button
            kind="secondary"
            busy={busy}
            disabled={cloud.mode === "locked"}
            onPress={() => void run(() => downloadBackup(data))}
          >
            Tam JSON yedeğini indir
          </Button>
        )}
        {(cloud.authenticated || cloud.mode === "locked") && (
          <Button kind="ghost" busy={busy} onPress={() => void run(leaveCloud)}>
            Oturumu kapat ve yerel bütçeye dön
          </Button>
        )}
        <ErrorText message={error || cloud.error} />
      </View>
      {confirm && (
        <Sheet
          title="Yerel bütçe SQL’e aktarılsın mı?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <Txt style={{ color: C.muted, marginVertical: 16 }}>
            {data.transactions.length} işlem, {data.categories.length} kategori,
            bütçeler, tasarruf hedefleri ve kur kayıtları aktarılır. Bu
            cihazdaki özgün kopya korunur. Sunucuda mevcut bütçe varsa üzerine
            yazılmaz.
            {data.demo ? " Dikkat: Bu bütçe örnek veriler içeriyor." : ""}
          </Txt>
          <ErrorText message={error} />
          <Button
            busy={busy}
            onPress={() =>
              void run(async () => {
                await startCloud(true);
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
